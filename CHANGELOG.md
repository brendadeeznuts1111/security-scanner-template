# Changelog

All notable changes to this project will be documented in this file.

## 1.1.0

Requires **Bun >= 1.3.14**.

### Operator toolkit

- Domain configuration system: `domains/*.security.json5` parsed with `Bun.JSON5.parse`, golden template at `templates/domain.template.json5`.
- Interactive operator CLI (`bun sp` / `bun run sp`): shell REPL, `start`, `doctor`, `bench`, `scan`, `tls`, `qr`, `audit`, and `report` subcommands.
- Config doctor with JSON/matrix/benchmark output and structured diagnostics (`doctor-diagnostics`).
- Per-domain encrypted JSONL audit (default path `./.security/<reverse-dns-segment>/audit.jsonl.enc`) with `AUDIT_MASTER_KEY` fallback.
- Vault integration (`.vault/`) and `Bun.secrets` inventory sync per reverse-DNS domain.
- Domain resolution via `--domain`, `SP_DOMAIN`, or `SECURITY_SCANNER_DOMAIN`.

### Supply chain and governance

- Field matrix CLI (`bun run matrix`) and concern color mapping for operator output.
- Cross-reference catalog (`bun run xref`).
- Mitata benchmark suites (`bun run bench` / `bun sp bench`).
- External scanner orchestration (`bun sp scan`) behind `SCAN_EXTERNAL`.
- Spawn helpers, `spawnSync`, stderr capture, and `SPAWN_BEHAVIOR` for subprocess boundaries.
- OS signal helpers (`onInterruptSignals`) for watch mode and shell audit tail.

### Build and features

- Compile-time feature flags: `AUDIT_JSONL`, `AUDIT_SQLITE`, `INTEL_DNS`, `REPORT_MARKDOWN`, `REPORT_HTML`, `CACHE_REDIS`, `FEED_WEBSOCKET`, `SCAN_EXTERNAL`, `DEBUG`, `MOCK_API`.
- Deployment profiles: `agent`, `server`, `dev` (bundle via `build --profile`).

### Unchanged from 1.0.0

- Install-hook security scanner API, threat feed configuration, Zod validation, tarball hash verification, and publishing workflow remain fully supported.

## 1.0.0

- Initial production-hardened template based on `oven-sh/security-scanner-template`.
- `rules/security-rules.json` is now the default local threat feed, exported as `./rules` and `./rules.json`.
- Added Zod validation for all threat feeds.
- Added configurable remote feed via `THREAT_FEED_URL`.
- Added local file feed via `THREAT_FEED_PATH` using `Bun.file`.
- Added tarball hash verification using `Bun.CryptoHasher`.
- Added defensive error handling and fetch timeout/retry logic.
- Added `deprecated` category mapped to advisory `warn` level.
- Memoized parsed default rules to avoid re-reading the file on every scan.
- Added governance scripts (`lint`, `typecheck`, `test`, `check`, `format`).
