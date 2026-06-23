# Changelog

All notable changes to this project will be documented in this file.

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
