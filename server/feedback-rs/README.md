# Rust feedback service candidate

This replaces the feedback HTTP process from `relay/feedback-server.mjs`. It does
not replace the room relay or the data collector.

The ARM64 musl binary with SHA-256
`9b3bddd5b3b0c2eba822ce2b09abc11e6439ed9249e078528f1c6d690e69d84d`
was activated on the verified `free-vps` instance (identity recorded in the
local `rift-buddy-servers.json`). The systemd unit uses
`/opt/rift-buddy-feedback/rust-9b3bddd5/rift-buddy-feedback` and preserves the
existing private storage directory and service sandbox. Room relay and Caddy
were not restarted. The previous unit is temporarily retained at
`/opt/rift-buddy-feedback/rollback-rust/feedback.service` for rollback.

The ARM64 candidate passed isolated health, synthetic submission and per-IP
quota checks before activation. After activation the loopback health check
passed and the public `/v1/feedback` endpoint returned 405 for GET as expected.
The post-start MemoryCurrent reading was 856064 bytes; this is an idle point
measurement, not a sustained-load benchmark.

Build and test on Windows with the native MSVC environment:

```powershell
scripts/cargo-msvc.cmd cargo build --manifest-path server/feedback-rs/Cargo.toml
scripts/cargo-msvc.cmd cargo test --manifest-path server/feedback-rs/Cargo.toml
node scripts/check-feedback-rust.mjs
```

The HTTP comparison starts both implementations with isolated synthetic stores,
checks status codes and response fields, and compares stored payloads after
removing generated IDs and timestamps. It never sends feedback to a public host.
The Rust candidate binds only to `127.0.0.1:8790`; keep this port free during the
comparison. Stop the candidate before starting another comparison.

The candidate preserves the bounded feedback whitelist, PNG CRC and dimension
checks, UTF-16 text length, IP admission quotas, two concurrent submissions,
seven-day expiry, and the lack of public feedback reads. Disk writes retain
their concurrency permit after a response deadline or client disconnect.

## Before deployment

- The listener caps total connections at 16, disables keepalive and limits header
  reading to five seconds. Hyper has an 8192-byte parser buffer minimum; a
  handler-level 4096-byte header name/value check adds a tighter bound, but is
  not byte-for-byte equivalent to Node's parser accounting.
- The deployed ARM64 binary passed 12 isolated transport/filesystem checks,
  including slow headers/body, disconnect recovery, chunked limits, connection
  and disk caps, TTL, symlink refusal, permissions and bounded shutdown. See
  `../../docs/server-network-validation.md` and
  `../../scripts/check-feedback-transport-remote.py`. Stalled-write injection
  remains untested by this transport corpus.
- ARM64 is built using Rust's self-contained musl target and rust-lld. Keep
  exercising Linux-specific filesystem and shutdown behavior.
- Read `docs/server-operations.md`, resolve the existing SSH alias, and verify the
  instance against `%USERPROFILE%/.ssh/rift-buddy-servers.json` before any remote
  mutation. The user supplied `free-vps`; its IMDSv2 identity and active services
  were checked before activation. The formal local inventory still needs repair.
- Inspect the active feedback systemd unit and storage path, validate the new
  binary against isolated data, and retain a verified rollback until activation
  passes its local and HTTPS health checks.

Passing the initial test corpus does not establish complete protocol equivalence
or production readiness. Dependency versions are recorded in `Cargo.lock`.
