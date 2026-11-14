use std::io;
use std::path::{Path, PathBuf};

use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

use crate::support::uuid_v4;
use crate::validate::Feedback;

/// Records live seven days; only this service's own UUID files are touched.
pub const TTL_MS: i64 = 7 * 24 * 60 * 60 * 1000;

/// Mirrors recordName in relay/feedback-server.mjs: only this service's own
/// UUID records are ever pruned, never arbitrary neighbours.
pub fn is_record_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    if bytes.len() != 41 || !name.ends_with(".json") {
        return false;
    }
    let body = &bytes[..36];
    for (index, byte) in body.iter().enumerate() {
        if matches!(index, 8 | 13 | 18 | 23) {
            if *byte != b'-' {
                return false;
            }
            continue;
        }
        if !matches!(byte, b'0'..=b'9' | b'a'..=b'f') {
            return false;
        }
    }
    body[14] == b'4' && matches!(body[19], b'8' | b'9' | b'a' | b'b')
}

#[derive(Debug)]
pub enum StoreError {
    Full,
    Io(io::Error),
}

pub struct Store {
    root: PathBuf,
    max_count: usize,
    max_bytes: u64,
    lock: Mutex<()>,
}

impl Store {
    pub async fn create(directory: &Path, max_count: usize, max_bytes: u64) -> io::Result<Self> {
        if fs::metadata(directory).await.is_err() {
            fs::create_dir_all(directory).await?;
        }
        let meta = fs::symlink_metadata(directory).await?;
        if !meta.is_dir() || meta.file_type().is_symlink() {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Invalid feedback directory"));
        }
        let root = fs::canonicalize(directory).await?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).await?;
        }
        Ok(Self { root, max_count, max_bytes, lock: Mutex::new(()) })
    }

    async fn inventory(&self, now_ms: i64) -> io::Result<(Vec<(String, u64)>, u64)> {
        let mut entries = fs::read_dir(&self.root).await?;
        let mut rows = Vec::new();
        let mut bytes = 0u64;
        while let Some(entry) = entries.next_entry().await? {
            let name = entry.file_name().to_string_lossy().to_string();
            if !is_record_name(&name) {
                continue;
            }
            let meta = fs::symlink_metadata(entry.path()).await?;
            if !meta.is_file() || meta.file_type().is_symlink() {
                return Err(io::Error::new(io::ErrorKind::InvalidData, "Invalid feedback entry"));
            }
            if now_ms - modified_ms(&meta) > TTL_MS {
                fs::remove_file(entry.path()).await?;
                continue;
            }
            rows.push((name, meta.len()));
            bytes += meta.len();
        }
        Ok((rows, bytes))
    }

    pub async fn prune(&self, now_ms: i64) -> io::Result<()> {
        let _guard = self.lock.lock().await;
        self.inventory(now_ms).await.map(|_| ())
    }

    pub async fn save(&self, feedback: &Feedback, now_ms: i64) -> Result<String, StoreError> {
        let _guard = self.lock.lock().await;
        let id = uuid_v4();
        let record = serde_json::json!({
            "id": id,
            "receivedAt": iso8601(now_ms),
            "version": feedback.version,
            "appVersion": feedback.app_version,
            "text": feedback.text,
            "images": feedback.images,
        });
        let body = serde_json::to_vec(&record).map_err(|error| StoreError::Io(io::Error::other(error)))?;

        let (rows, bytes) = self.inventory(now_ms).await.map_err(StoreError::Io)?;
        if rows.len() >= self.max_count || bytes + body.len() as u64 > self.max_bytes {
            return Err(StoreError::Full);
        }

        let path = self.root.join(format!("{id}.json"));
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&path).await.map_err(StoreError::Io)?;
        let write: io::Result<()> = async {
            file.write_all(&body).await?;
            file.sync_all().await?;
            Ok(())
        }
        .await;
        if let Err(error) = write {
            drop(file);
            let _ = fs::remove_file(&path).await;
            return Err(StoreError::Io(error));
        }
        drop(file);
        Ok(id)
    }
}

fn modified_ms(meta: &std::fs::Metadata) -> i64 {
    use std::time::UNIX_EPOCH;
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

/// RFC 3339 with milliseconds, matching new Date(ms).toISOString().
pub fn iso8601(now_ms: i64) -> String {
    let total_seconds = now_ms.div_euclid(1000);
    let millis = now_ms.rem_euclid(1000);
    let days = total_seconds.div_euclid(86_400);
    let seconds_of_day = total_seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3600;
    let minute = (seconds_of_day % 3600) / 60;
    let second = seconds_of_day % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m as u32, d as u32)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::validate::FeedbackImage;

    fn feedback() -> Feedback {
        Feedback {
            version: 1,
            app_version: "0.59.26".to_string(),
            text: "画面遮住技能栏".to_string(),
            images: vec![FeedbackImage { kind: "image/png", data: String::new() }],
        }
    }

    fn tempdir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("rift-feedback-{}", uuid_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn serializes_quota_checks_and_rejects_beyond_the_cap() {
        let dir = tempdir();
        let store = Store::create(&dir, 1, 1 << 20).await.unwrap();
        assert!(store.save(&feedback(), 1_700_000_000_000).await.is_ok());
        assert!(matches!(store.save(&feedback(), 1_700_000_000_001).await, Err(StoreError::Full)));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn expires_only_its_own_records() {
        let dir = tempdir();
        std::fs::write(dir.join("player-owned.txt"), b"keep").unwrap();
        let store = Store::create(&dir, 10, 1 << 20).await.unwrap();
        let id = store.save(&feedback(), 1_700_000_000_000).await.unwrap();
        let ancient = std::time::UNIX_EPOCH + std::time::Duration::from_millis((1_700_000_000_000i64 - 8 * 86_400_000) as u64);
        let file = std::fs::File::options().write(true).open(dir.join(format!("{id}.json"))).unwrap();
        file.set_modified(ancient).unwrap();
        drop(file);
        store.prune(1_700_000_000_000).await.unwrap();
        let names: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, ["player-owned.txt"]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn record_names_match_only_uuid_json() {
        assert!(is_record_name("d99c020c-949a-49c1-a66e-b8cf1331a251.json"));
        assert!(!is_record_name("d99c020c-949a-19c1-a66e-b8cf1331a251.json"));
        assert!(!is_record_name("d99c020c-949a-49c1-c66e-b8cf1331a251.json"));
        assert!(!is_record_name("player-owned.json"));
    }

    #[test]
    fn timestamps_match_javascript_iso_strings() {
        assert_eq!(iso8601(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso8601(1_700_000_000_000), "2023-11-14T22:13:20.000Z");
    }
}
