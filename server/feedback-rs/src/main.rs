mod limits;
mod png;
mod server;
mod store;
mod support;
mod validate;
mod wire;

use std::path::PathBuf;

#[tokio::main(worker_threads = 2)]
async fn main() {
    let directory = std::env::args().nth(1).unwrap_or_default();
    let path = PathBuf::from(&directory);
    if directory.is_empty() || !path.is_absolute() {
        eprintln!("Absolute feedback directory required");
        std::process::exit(2);
    }

    let app = match server::build(&path, server::Caps::default(), server::RECEIVE_TIMEOUT).await {
        Ok(app) => app,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    };

    let port: u16 = std::env::var("RIFT_FEEDBACK_PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(8790);
    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    };
    let port = listener.local_addr().expect("bound listener address").port();
    println!("rift-buddy-feedback listening on 127.0.0.1:{port}");

    let connections = std::sync::Arc::new(tokio::sync::Semaphore::new(16));
    let mut tasks = tokio::task::JoinSet::new();
    let stopping = shutdown();
    tokio::pin!(stopping);
    loop {
        tokio::select! {
            _ = &mut stopping => break,
            Some(_) = tasks.join_next(), if !tasks.is_empty() => {},
            accepted = listener.accept() => {
                let Ok((stream, peer)) = accepted else { continue };
                let Ok(permit) = std::sync::Arc::clone(&connections).try_acquire_owned() else { continue };
                let service = app.clone().layer(axum::Extension(axum::extract::ConnectInfo(peer)));
                tasks.spawn(async move {
                    let _permit = permit;
                    let _ = hyper::server::conn::http1::Builder::new()
                        .timer(hyper_util::rt::TokioTimer::new())
                        .header_read_timeout(std::time::Duration::from_secs(5))
                        .max_buf_size(8192)
                        .keep_alive(false)
                        .serve_connection(hyper_util::rt::TokioIo::new(stream), hyper_util::service::TowerToHyperService::new(service))
                        .await;
                });
            }
        }
    }
    // Bound shutdown; let in-progress submissions finish first.
    let _ = tokio::time::timeout(std::time::Duration::from_secs(8), async {
        while tasks.join_next().await.is_some() {}
    }).await;
}

async fn shutdown() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut terminate = signal(SignalKind::terminate()).expect("SIGTERM handler");
        tokio::select! {
            _ = terminate.recv() => {},
            _ = tokio::signal::ctrl_c() => {},
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
