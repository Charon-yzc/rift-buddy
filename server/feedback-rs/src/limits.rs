// Per-IP and global admission, mirroring admit() in relay/feedback-server.mjs.
// The IP is only kept as an HMAC of a per-process salt, so the map cannot be
// read back into addresses.

use std::collections::HashMap;

use hmac::{Hmac, Mac};
use sha2::Sha256;
use tokio::sync::Mutex;

pub const DAY_MS: i64 = 86_400_000;
const WINDOW_MS: i64 = 600_000;
const BURST_MS: i64 = 60_000;
const PER_IP_DAY: u32 = 10;
const PER_IP_WINDOW: usize = 3;
const GLOBAL_DAY: u32 = 100;
const BURST: usize = 10;
const MAX_KEYS: usize = 1024;

struct Budget {
    day: i64,
    count: u32,
    last: i64,
    times: Vec<i64>,
}

struct Inner {
    day: i64,
    count: u32,
    burst: Vec<i64>,
    budgets: HashMap<[u8; 32], Budget>,
}

pub struct Limiter {
    salt: [u8; 32],
    inner: Mutex<Inner>,
}

impl Limiter {
    pub fn new(salt: [u8; 32]) -> Self {
        Self {
            salt,
            inner: Mutex::new(Inner { day: -1, count: 0, burst: Vec::new(), budgets: HashMap::new() }),
        }
    }

    fn key(&self, address: &str) -> [u8; 32] {
        let mut mac = <Hmac<Sha256>>::new_from_slice(&self.salt).expect("hmac accepts any key");
        mac.update(address.as_bytes());
        let digest = mac.finalize().into_bytes();
        let mut out = [0u8; 32];
        out.copy_from_slice(&digest);
        out
    }

    pub async fn admit(&self, address: &str, now_ms: i64) -> bool {
        let mut inner = self.inner.lock().await;
        let day = now_ms.div_euclid(DAY_MS);
        if inner.day != day {
            inner.day = day;
            inner.count = 0;
        }
        inner.burst.retain(|at| now_ms - at < BURST_MS);
        inner.budgets.retain(|_, budget| now_ms - budget.last < DAY_MS);

        let key = self.key(address);
        let fresh = !inner.budgets.contains_key(&key);
        let previous = inner.budgets.get(&key).map(|budget| (budget.day, budget.count, budget.times.clone()));
        let (count, times) = match previous {
            Some((budget_day, budget_count, budget_times)) => (
                if budget_day == day { budget_count } else { 0 },
                budget_times.into_iter().filter(|at| now_ms - at < WINDOW_MS).collect::<Vec<_>>(),
            ),
            None => (0, Vec::new()),
        };

        if count >= PER_IP_DAY
            || times.len() >= PER_IP_WINDOW
            || inner.count >= GLOBAL_DAY
            || inner.burst.len() >= BURST
            || (fresh && inner.budgets.len() >= MAX_KEYS)
        {
            return false;
        }

        let mut times = times;
        times.push(now_ms);
        inner.budgets.insert(key, Budget { day, count: count + 1, last: now_ms, times });
        inner.count += 1;
        inner.burst.push(now_ms);
        true
    }
}

pub fn now_ms() -> i64 {
    crate::support::now_ms()
}

pub fn random_salt() -> [u8; 32] {
    let mut salt = [0u8; 32];
    salt.copy_from_slice(&crate::support::random_bytes(32));
    salt
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn stops_a_single_address_after_three_in_ten_minutes() {
        let limiter = Limiter::new(random_salt());
        let now = 1_700_000_000_000;
        assert!(limiter.admit("192.0.2.1", now).await);
        assert!(limiter.admit("192.0.2.1", now + 1).await);
        assert!(limiter.admit("192.0.2.1", now + 2).await);
        assert!(!limiter.admit("192.0.2.1", now + 3).await);
        assert!(limiter.admit("192.0.2.2", now + 4).await);
        assert!(limiter.admit("192.0.2.1", now + WINDOW_MS + 5).await);
    }

    #[tokio::test]
    async fn caps_the_global_burst() {
        let limiter = Limiter::new(random_salt());
        let now = 1_700_000_000_000;
        for index in 0..BURST {
            assert!(limiter.admit(&format!("192.0.2.{index}"), now).await);
        }
        assert!(!limiter.admit("198.51.100.1", now).await);
        assert!(limiter.admit("198.51.100.1", now + BURST_MS).await);
    }
}
