// Loopback-only HTTP service. Mirrors relay/feedback-server.mjs:
// health probe, POST /v1/feedback, strict JSON only, bounded body, per-IP and
// global admission, and no reads of stored feedback.

use std::net::{IpAddr, SocketAddr};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::extract::{ConnectInfo, State};
use axum::http::header::{CACHE_CONTROL, CONNECTION, CONTENT_ENCODING, CONTENT_LENGTH, CONTENT_TYPE};
use axum::http::{HeaderValue, Method, Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::any;
use axum::{Json, Router};
use http_body_util::{BodyExt, Limited};
use serde_json::{json, Value};
use tokio::sync::Semaphore;

use crate::limits::{now_ms, random_salt, Limiter};
use crate::store::Store;
use crate::validate::{self, BODY_BYTES};

pub const MAX_INFLIGHT: usize = 2;
pub const RECEIVE_TIMEOUT: Duration = Duration::from_secs(20);
pub const PRUNE_INTERVAL: Duration = Duration::from_secs(3600);

#[derive(Debug, Clone, Copy)]
pub struct Caps {
    pub max_count: usize,
    pub max_bytes: u64,
}

impl Default for Caps {
    fn default() -> Self {
        Self { max_count: 200, max_bytes: 256 * 1024 * 1024 }
    }
}

pub struct AppState {
    store: Arc<Store>,
    limiter: Limiter,
    inflight: Arc<Semaphore>,
    receive_timeout: Duration,
}

fn respond(status: u16, body: Value) -> Response {
    let status = StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let mut response = (status, Json(body)).into_response();
    let headers = response.headers_mut();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(CONNECTION, HeaderValue::from_static("close"));
    headers.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    if status == StatusCode::TOO_MANY_REQUESTS {
        headers.insert("retry-after", HeaderValue::from_static("600"));
    }
    response
}

fn error(status: u16, message: &str) -> Response {
    respond(status, json!({ "error": message }))
}

async fn handle(State(state): State<Arc<AppState>>, ConnectInfo(peer): ConnectInfo<SocketAddr>, request: Request<Body>) -> Response {
    let header_bytes: usize = request.headers().iter().map(|(name,value)| name.as_str().len()+value.as_bytes().len()).sum();
    if header_bytes > 4096 { return error(431, "headers too large"); }
    if request.uri().path_and_query().map(|v| v.as_str()) == Some("/healthz") && request.method() == Method::GET {
        return respond(200, json!({ "ok": true, "service": "rift-buddy-feedback" }));
    }
    if request.uri().path_and_query().map(|v| v.as_str()) != Some("/v1/feedback") {
        return error(404, "not found");
    }
    if request.method() != Method::POST {
        return error(405, "POST required");
    }
    if !peer.ip().is_loopback() {
        return error(403, "proxy required");
    }
    let forwarded = request
        .headers()
        .get("x-feedback-client-ip")
        .and_then(|value| value.to_str().ok())
        .filter(|value| value.parse::<IpAddr>().is_ok())
        .map(str::to_owned);
    let Some(forwarded) = forwarded else {
        return error(403, "proxy required");
    };

    let content_type = request.headers().get(CONTENT_TYPE).and_then(|value| value.to_str().ok());
    if content_type != Some("application/json") || request.headers().contains_key(CONTENT_ENCODING) {
        return error(415, "JSON required");
    }
    if let Some(declared) = request.headers().get(CONTENT_LENGTH) {
        let declared = declared.to_str().unwrap_or("");
        let digits = !declared.is_empty() && declared.bytes().all(|byte| byte.is_ascii_digit());
        if !digits || declared.parse::<usize>().map(|value| value > BODY_BYTES).unwrap_or(true) {
            return error(413, "too large");
        }
    }

    let ticket = match Arc::clone(&state.inflight).try_acquire_owned() {
        Ok(ticket) => ticket,
        Err(_) => return error(429, "rate limited"),
    };
    if !state.limiter.admit(&forwarded, now_ms()).await {
        return error(429, "rate limited");
    }

    let deadline = tokio::time::Instant::now() + state.receive_timeout;
    let limited = Limited::new(request.into_body(), BODY_BYTES);
    let collected = match tokio::time::timeout(state.receive_timeout, limited.collect()).await {
        Err(_) => return error(408, "timeout"),
        Ok(Err(failure)) => {
            let too_large = failure.downcast_ref::<http_body_util::LengthLimitError>().is_some();
            return if too_large { error(413, "too large") } else { error(400, "invalid feedback") };
        }
        Ok(Ok(collected)) => collected.to_bytes(),
    };

    let input: Value = match serde_json::from_slice(&collected) {
        Ok(value) => value,
        Err(_) => return error(400, "invalid feedback"),
    };
    let feedback = match validate::validate(&input) {
        Ok(feedback) => feedback,
        Err(failure) => return error(failure.status(), "invalid feedback"),
    };
    // Saving must survive disconnect/response timeout and retain its permit until
    // fsync finishes; otherwise two stalled writes permit unbounded new work.
    let store = Arc::clone(&state.store);
    let saving = tokio::spawn(async move {
        let _ticket = ticket;
        store.save(&feedback, now_ms()).await
    });
    match tokio::time::timeout_at(deadline, saving).await {
        Ok(Ok(Ok(id))) => respond(201, json!({ "id": id })),
        _ => error(503, "feedback unavailable"),
    }
}

pub async fn build(directory: &Path, caps: Caps, receive_timeout: Duration) -> std::io::Result<Router> {
    let store = Arc::new(Store::create(directory, caps.max_count, caps.max_bytes).await?);
    store.prune(now_ms()).await?;
    {
        let store = Arc::clone(&store);
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(PRUNE_INTERVAL);
            ticker.tick().await;
            loop {
                ticker.tick().await;
                let _ = store.prune(now_ms()).await;
            }
        });
    }
    let state = Arc::new(AppState {
        store,
        limiter: Limiter::new(random_salt()),
        inflight: Arc::new(Semaphore::new(MAX_INFLIGHT)),
        receive_timeout,
    });
    Ok(Router::new().fallback(any(handle)).with_state(state))
}
