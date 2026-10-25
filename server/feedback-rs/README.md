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
Each comparison starts a fresh Rust child on an OS-allocated loopback port.
`RIFT_FEEDBACK_PORT` is overridden for that child and readiness names its actual
port; no probe or synthetic POST is sent to the production port or another store.
Fresh per-case processes prevent the burst quota from hiding validation cases.
The normal service still defaults to 8790; port 0 is available for isolated tests.

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

## Review corrections (2026-10-25)

The HTTP parser retains only the four permitted envelope fields and at most
three images. Unknown and wrongly typed nested values are consumed without
expanding them into JSON trees; complete syntax is checked before validation.
Duplicate keys retain JSON.parse last-value semantics. The differential corpus
checks each expected status as well as Node parity and stored whitelist content.
Prior deployment measurements above describe the existing binary, not this
revised source. Rebuild and validate in isolation before replacing production.
