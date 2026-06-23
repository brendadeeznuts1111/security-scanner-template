<img src="https://bun.com/logo.png" height="36" />

# Bun Security Scanner Template

A template for creating a security scanner for Bun's package installation
process. Security scanners scan packages against your threat intelligence feeds
and control whether installations proceed based on detected threats.

The same repository also ships an **operator toolkit**: domain-aware JSON5
configuration, encrypted audit logs, vault/secrets sync, an interactive CLI
(`bun sp`), benchmarks, and supply-chain governance helpers. Requires
**Bun >= 1.3.14**.

📚 [**Bun security scanner API**](https://bun.com/docs/install/security-scanner-api)

## Operator toolkit

Use this when you run security services per product domain (reverse-DNS
identifiers) rather than only as an install hook.

### Quick start

```bash
bun install

# Copy the golden template and edit for your domain
cp templates/domain.template.json5 domains/com.example.service.security.json5

# Set audit encryption (or put masterKey in domain config)
export AUDIT_MASTER_KEY="$(bun run master-key)"

# Validate config, vault, secrets, and audit paths
bun sp doctor --json

# Interactive operator REPL (domain, audit tail, scan, build, …)
bun sp shell --domain com.example.service
```

Domain selection precedence: `--domain` flag → `SP_DOMAIN` or
`SECURITY_SCANNER_DOMAIN` → sole file in `domains/` → interactive prompt.

### Domain configuration

Domain configs live in `domains/*.security.json5` and are parsed with
[`Bun.JSON5.parse`](https://bun.com/docs/api/json5). Start from
`templates/domain.template.json5` — only `domain` (reverse-DNS) is required;
defaults are applied on load (audit paths, secrets service namespace, etc.).

| Area                          | Purpose                                            |
| ----------------------------- | -------------------------------------------------- |
| `domain`                      | Reverse-DNS id and `Bun.secrets` service namespace |
| `secrets`                     | Vault inventory synced to the OS credential store  |
| `supplyChain`                 | Threat feeds, policy severity, scanner integration |
| `audit`                       | Per-domain encrypted JSONL (default) or SQLite     |
| `identity` / `token` / `csrf` | Auth and session policies                          |
| `service`                     | `Bun.serve` runtime (port, HTTP/3, TLS)            |
| `channels` / `colors`         | Terminal and concern-colored operator output       |

Inspect every field (and concern color tags) with:

```bash
bun run matrix --template          # template field matrix
bun run matrix --domain com.example.service
bun run matrix --domain com.example.service --alignment   # value vs strong default + options
bun run matrix --concerns          # ast-grep-style concern → channel map
bun run flags                      # compile-time feature flags + profiles
bun run flags --profile agent --json
bun run xref                       # API / module cross-reference catalog
```

Domain config files must be named `domains/<reverse-dns>.security.json5`
(matching `domain` in the file). Secret inventory names use kebab-case
(`threat-feed-api-key`). `bun sp doctor` enforces both.

Encrypted vault artifacts default under `.vault/`; per-domain security state
under `.security/<reverse-dns-segment>/`.

### Operator CLI

| Command                                    | Description                                                        |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `bun sp` / `bun sp shell`                  | Interactive security operator REPL                                 |
| `bun sp start --domain <name>`             | Start domain `Bun.serve` service (`--watch` reloads configs)       |
| `bun sp doctor`                            | Config doctor (`--json`, `--matrix`, `--benchmark`)                |
| `bun sp bench`                             | Mitata benchmarks (`doctor`, `field-matrix`, `domain-load`, `all`) |
| `bun sp scan --domain <name>`              | External scanner orchestration (e.g. Trivy)                        |
| `bun sp tls --domain <name> --host <host>` | Remote TLS inspection                                              |
| `bun sp qr` / `bun sp report`              | Operator QR codes and visual reports                               |
| `bun run doctor`                           | Same as `bun sp doctor`                                            |
| `bun run vault`                            | Vault CLI                                                          |
| `bun run master-key`                       | Generate audit master key material                                 |
| `bun run bench`                            | Same as `bun sp bench`                                             |
| `bun run flags`                            | Feature flags and deployment profiles (`--json`)                   |

Inside `bun sp shell`, run `help` for REPL commands (`domain`, `audit tail`,
`features`, `profiles`, `build --profile agent|server|dev`, etc.).

### Audit

Per-domain encrypted JSONL is the default when `AUDIT_JSONL` is enabled:

```
./.security/<reverse-dns-segment>/audit.jsonl.enc
```

Set `audit.jsonl.masterKey` in the domain config or export `AUDIT_MASTER_KEY`.
Tail recent events from the shell or one-shot:

```bash
bun sp shell --domain com.example.service
# audit tail
# audit tail --follow   # pipes cleanly to jq / fx on Bun >= 1.3.14
```

SQLite audit is available when built with `AUDIT_SQLITE` (see **Build profiles**
below).

### Build profiles and feature flags

Compile-time features gate optional subsystems (audit backends, reports, external
scanners, debug tooling). Tests enable all features via `bun test --feature=…`
(see `package.json`).

| Profile  | Features                                                                | Use case                 |
| -------- | ----------------------------------------------------------------------- | ------------------------ |
| `agent`  | `AUDIT_JSONL`, `INTEL_DNS`, `SCAN_EXTERNAL`                             | Lightweight edge runtime |
| `server` | `AUDIT_SQLITE`, `REPORT_HTML`, `CACHE_REDIS`, `INTEL_DNS`               | Enterprise server        |
| `dev`    | `DEBUG`, `MOCK_API`, `FEED_WEBSOCKET`, `AUDIT_JSONL`, `REPORT_MARKDOWN` | Local development        |

```bash
# Inside bun sp shell
build --profile agent

# Or standalone bundle build
bun run build:bundle -- --profile agent --outdir dist
```

Override at runtime with `FEATURE_<NAME>=true|false` (e.g.
`FEATURE_SCAN_EXTERNAL=false`). List active flags in the REPL with `features`.

## How It Works

When packages are installed via Bun, your security scanner:

1. **Receives** package information (name, version)
2. **Queries** your threat intelligence API
3. **Validates** the response data
4. **Categorizes** threats by severity
5. **Returns** advisories to control installation (empty array if safe)

### Advisory Levels

- **Fatal** (`level: 'fatal'`): Installation stops immediately
  - Examples: malware, token stealers, backdoors, critical vulnerabilities
- **Warning** (`level: 'warn'`): User prompted for confirmation
  - In TTY: User can choose to continue or cancel
  - Non-TTY: Installation automatically cancelled
  - Examples: protestware, adware, deprecated packages

All advisories are always displayed to the user regardless of level.

### Error Handling

If your `scan` function throws an error, it will be gracefully handled by Bun, but the installation process **will be cancelled** as a defensive precaution.

### Validation

When fetching threat feeds over the network, use schema validation  
(e.g., Zod) to ensure data integrity. Invalid responses should fail immediately
rather than silently returning empty advisories.

```typescript
import {z} from 'zod';

const ThreatFeedItemSchema = z.object({
	package: z.string(),
	range: z.string(),
	url: z.string().nullable(),
	description: z.string().nullable(),
	categories: z.array(
		z.enum(['protestware', 'adware', 'backdoor', 'malware', 'botnet', 'deprecated']),
	),
});
```

### Useful Bun APIs

Bun provides several built-in APIs that are particularly useful for security scanner:

- [**Security scanner API Reference**](https://bun.com/docs/install/security-scanner-api): Complete API documentation for security scanners
- [**`Bun.semver.satisfies()`**](https://bun.com/docs/api/semver): Essential for checking if package versions match vulnerability ranges. No external dependencies needed.

  ```typescript
  if (Bun.semver.satisfies(version, '>=1.0.0 <1.2.5')) {
  	// Version is vulnerable
  }
  ```

- [**`Bun.hash`**](https://bun.com/docs/api/hashing#bun-hash): Fast non-cryptographic hashing.
- [**`Bun.CryptoHasher`**](https://bun.com/docs/api/hashing#bun-cryptohasher): Cryptographic hashing used here for SHA-256 tarball integrity checks.
- [**`Bun.file`**](https://bun.com/docs/api/file-io): Efficient file I/O used here to load local threat databases.

## Configuration

The scanner can be configured with environment variables and/or CLI flags. CLI flags take precedence over env vars.

| Env var                      | CLI flag                       | Description                                                                                                                              | Default                         |
| ---------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `THREAT_FEED_STDIN`          | `--threat-feed-stdin`          | Read threat feed JSON from stdin.                                                                                                        | —                               |
| `THREAT_FEED_URL`            | `--threat-feed-url`            | URL of a remote JSON threat feed.                                                                                                        | —                               |
| `THREAT_FEED_PATH`           | `--threat-feed-path`           | Path to a local JSON threat feed file.                                                                                                   | —                               |
| `THREAT_FEED_TIMEOUT_MS`     | `--threat-feed-timeout-ms`     | Timeout for fetching the remote feed.                                                                                                    | `5000`                          |
| `THREAT_FEED_RETRIES`        | `--threat-feed-retries`        | Number of retries for remote feed requests.                                                                                              | `2`                             |
| `THREAT_FEED_TOKEN_PROVIDER` | `--threat-feed-token-provider` | Token source for authenticated fetch: `bun-secrets` (default) or `env`.                                                                  | `bun-secrets`                   |
| `THREAT_FEED_TOKEN`          | —                              | Bearer token value when provider is `env`. Use this for production secret injection.                                                     | —                               |
| `THREAT_FEED_TOKEN_NAME`     | `--threat-feed-token-name`     | Keychain entry name for the remote feed bearer token when provider is `bun-secrets`.                                                     | —                               |
| `THREAT_FEED_TOKEN_SERVICE`  | `--threat-feed-token-service`  | Keychain service name for the token (reverse-DNS per [Bun.secrets best practices](https://bun.com/docs/runtime/secrets#best-practices)). | `com.acme.bun-security-scanner` |
| `SCANNER_LOG_PATH`           | `--scanner-log-path`           | Append structured JSON events to this file.                                                                                              | —                               |
| `SCANNER_LOG_STDERR`         | `--scanner-log-stderr`         | Emit structured events to stderr.                                                                                                        | `0`                             |
| `CONSOLE_DEPTH`              | `--console-depth`              | Set `console.depth` for deeper inspection logging.                                                                                       | —                               |
| `THREAT_FEED_CACHE_TTL`      | `--threat-feed-cache-ttl`      | Cache remote feeds for this many milliseconds (`0` disables caching).                                                                    | `0`                             |
| `DRY_RUN`                    | `--dry-run`                    | Run the scan but downgrade `fatal` advisories to `warn` and never block.                                                                 | `0`                             |
| —                            | `--healthcheck`                | Pre-flight health check: prints threat-feed, secrets-backend, and registry status as JSON.                                               | —                               |
| —                            | `--check-registry`             | Verify registry connectivity and auth before publishing.                                                                                 | —                               |
| —                            | `--json`                       | After the scan completes, print the advisory array as JSON to stdout.                                                                    | —                               |

Feed precedence: `THREAT_FEED_STDIN` → `THREAT_FEED_URL` → `THREAT_FEED_PATH` → `rules/security-rules.json` → hardcoded fallback.

CLI flags are parsed from `Bun.argv` using [`util.parseArgs`](https://bun.com/docs/guides/process/argv#parse-command-line-arguments) with `strict: false`, so unknown args from the host process (e.g. `bun install --production`) are safely ignored.

```bash
# Using env vars
THREAT_FEED_URL=https://threat.example.com/feed.json bun install

# Using CLI flags (when running the scanner standalone)
bun run src/index.ts --threat-feed-url https://threat.example.com/feed.json --scanner-log-stderr

# Piping a feed via stdin
curl https://threat.example.com/feed.json | bun run src/index.ts --threat-feed-stdin
cat custom-rules.json | THREAT_FEED_STDIN=1 bun run src/index.ts
```

The bundled `rules/security-rules.json` is the scanner's default policy. It is also exported as `./rules` and `./rules.json` so downstream tools can import the same definitions the scanner uses.

### Machine-readable scan output (`--json`)

When running the scanner in a CI pipeline or script, pass `--json` to emit the full
advisory array to stdout after the scan completes. stderr remains free for the
human-readable event log and progress messages.

```bash
bun run src/index.ts --threat-feed-url https://threat.example.com/feed.json --json > advisories.json
```

### Dry-run mode (`--dry-run`)

Dry-run runs the full scan but downgrades every `fatal` advisory to `warn` so it
never blocks installation. Use it to preview a new threat feed or ruleset
without breaking builds. The `scan.complete` event notes `(dry run)` in stderr.

```bash
bun run src/index.ts --threat-feed-url https://threat.example.com/feed.json --dry-run --scanner-log-stderr
```

Combined with `--json`, you can diff advisories between runs:

```bash
bun run src/index.ts --threat-feed-url https://threat.example.com/feed.json --dry-run --json > before.json
```

### Remote feed caching (`--threat-feed-cache-ttl`)

Set a cache TTL (in milliseconds) to keep recently fetched remote feeds on disk
and avoid fetching them on every scan. The first fetch populates the cache;
subsequent scans use the cached copy while refreshing it in the background for the
next run. `0` disables caching.

```bash
# Cache remote feeds for 5 minutes
bun run src/index.ts --threat-feed-url https://threat.example.com/feed.json --threat-feed-cache-ttl 300000
```

The cache is stored in `$XDG_CACHE_HOME/bun-security-scanner/` if
`XDG_CACHE_HOME` is set, otherwise in
`node_modules/.cache/bun-security-scanner/`. The scanner emits a `feed.loaded`
event with `source: "cache"` and logs the cache age on stderr when a cached feed
is used.

### Remote feed authentication (Bun.secrets)

When the remote threat feed requires authentication, the scanner reads a bearer
token from the OS keychain via [`Bun.secrets`](https://bun.com/docs/runtime/secrets)
and sends it as `Authorization: Bearer <token>`. This keeps credentials out of
env vars and source files.

Token lookup is **opt-in**: it only runs when `THREAT_FEED_TOKEN_NAME` is set.
Without it, the scanner fetches the feed unauthenticated (preserving existing
behavior). A missing or unreadable token degrades gracefully to an
unauthenticated request rather than failing the scan.

**One-time setup** — store the token in the keychain (run once per machine):

```bash
bun -e "await Bun.secrets.set({
  service: 'com.acme.bun-security-scanner',
  name: 'threat-feed-token',
  value: 'your-token-here',
})"
```

Or use the built-in helper (prompts interactively if `--store-token-value` is omitted):

```bash
bun run src/index.ts --store-token --threat-feed-token-name threat-feed-token --store-token-value your-token-here
```

The helper performs a quick write-then-delete probe (`__scanner_store_test__`) before
prompting for the real token. This surfaces a locked keychain or missing write permission
early, so you don't type a sensitive token only to have the store fail.

> **Security note:** passing `--store-token-value` on the command line exposes
> the token in your shell history and `ps` output. For sensitive tokens, prefer
> the interactive prompt (omit `--store-token-value`) or pipe via stdin:
>
> ```bash
> echo "$THREAT_FEED_TOKEN" | bun run src/index.ts --store-token --threat-feed-token-name threat-feed-token
> ```

**Use it** — point the scanner at the name you stored:

```bash
THREAT_FEED_URL=https://threat.example.com/feed.json \
THREAT_FEED_TOKEN_NAME=threat-feed-token \
bun install
```

#### `env` provider (production)

For production deployments where a secret manager injects the token into the
environment, set the provider to `env` and supply the token via `THREAT_FEED_TOKEN`:

```bash
THREAT_FEED_URL=https://threat.example.com/feed.json \
THREAT_FEED_TOKEN_PROVIDER=env \
THREAT_FEED_TOKEN=your-token-here \
bun install
```

This avoids relying on the OS keychain at runtime. The token CLI helpers
(`--store-token`, `--clear-token`, `--list-token`) only work with the default
`bun-secrets` provider.

To use a non-default service name (e.g. a UTI for a published CLI), set
`THREAT_FEED_TOKEN_SERVICE`:

```bash
THREAT_FEED_TOKEN_SERVICE=com.acme.scanner \
THREAT_FEED_TOKEN_NAME=threat-feed-token \
bun install
```

**Remove the token** when no longer needed:

```bash
bun run src/index.ts --clear-token --threat-feed-token-name threat-feed-token
```

#### Platform behavior

`Bun.secrets` delegates to the operating system's native credential store, so
platform behavior follows the OS:

- **macOS**: Credentials are stored in the user's login Keychain. The first
  access may prompt for permission, and credentials persist across restarts.
- **Linux**: Uses `libsecret` and requires a secret-service daemon such as
  GNOME Keyring or KWallet. The daemon must be running, and the keyring may
  prompt for unlock before the token can be read or written.
- **Windows**: Credentials are stored in Windows Credential Manager, scoped to
  the user, and encrypted with the Windows Data Protection API.

#### Security properties

- Credentials are encrypted at rest by the OS credential manager.
- Only the user who stored the token can retrieve it.
- The raw token is never written to plaintext files (`.env`, `.npmrc`, etc.).
- Bun zeros the token memory after use.

#### Limitations and CI

- Service and entry names should be under 256 characters.
- Maximum token length varies by platform (typically 2048–4096 bytes).
- Some special characters may need escaping depending on the platform.

In CI or other environments without a keychain, leave `THREAT_FEED_TOKEN_NAME`
unset and provide the feed via `THREAT_FEED_URL` to an unauthenticated endpoint,
or pipe it via `--threat-feed-stdin`. For production servers, prefer a dedicated
secret manager rather than `Bun.secrets`.

### Threat feed format

The feed can be a plain array of rules (legacy format) or a structured policy document with `rules` and an optional `allowlist`:

```json
{
	"rules": [
		{
			"package": "event-stream",
			"range": ">=3.3.6 <4.0.0",
			"url": "https://example.com/advisory",
			"description": "Malicious package",
			"categories": ["malware"],
			"hashes": ["sha256-of-bad-tarball"]
		}
	],
	"allowlist": [
		{
			"package": "event-stream",
			"range": "3.3.6",
			"reason": "approved for legacy build"
		}
	]
}
```

- `range` is a semver range matched with `Bun.semver.satisfies`.
- `categories` determines the advisory level:
  - `fatal`: `malware`, `backdoor`, `botnet`
  - `warn`: `protestware`, `adware`, `deprecated`
- `hashes` is optional. When provided, the scanner downloads the package tarball and verifies its SHA-256 hash before reporting the threat. This prevents false positives when a vulnerable version has been republished with a fix.
- `allowlist` is optional. Packages that match an allowlist entry are suppressed even when they match a rule.

### Structured event emission

When `SCANNER_LOG_PATH` or `SCANNER_LOG_STDERR=1` is set, the scanner emits JSON events:

- `scan.start`
- `feed.loaded`
- `threat.detected`
- `threat.allowed`
- `scan.complete`

Example:

```bash
SCANNER_LOG_STDERR=1 bun install
```

Stderr output is colorized via [`Bun.color`](https://bun.com/docs/api/color) and auto-detects terminal color support (respects `NO_COLOR`). The log file (`SCANNER_LOG_PATH`) always receives plain JSON for machine consumption.

## Testing

This template includes tests for a known malicious package version.
Customize the test file as needed.

```bash
bun test
```

## Publishing Your Scanner

This scanner is configured to publish to an internal, scoped registry. The
`publishConfig.registry` URL in `package.json` and the `.npmrc.example` file are set to
`https://registry.mycompany.com`. Replace it with your real registry URL before publishing.

### One-time setup

1. Copy the registry template:

   ```bash
   cp .npmrc.example .npmrc
   ```

2. Edit `.npmrc` and replace `https://registry.mycompany.com` with your real registry URL.
3. Set your auth token:

   ```bash
   export NPM_CONFIG_TOKEN=your-token-here
   ```

   `.npmrc` is gitignored so the token will never be committed.

### Publish manually

```bash
bun publish
```

`prepublishOnly` automatically runs `bun run check` before publishing.

### Check registry connectivity before publishing

Verify the registry is reachable and that your credentials are accepted without
attempting a real publish:

```bash
# Bearer token
NPM_CONFIG_TOKEN=your-token-here bun run check:registry

# Basic auth
REGISTRY_AUTH_TYPE=basic REGISTRY_USERNAME=your-user REGISTRY_PASSWORD=your-pass bun run check:registry
```

You can override the registry URL or auth type for the check:

```bash
bun run src/index.ts --check-registry --registry-url https://registry.example.com --registry-auth-type basic --registry-username your-user --registry-password your-pass
```

### Pre-flight health check

Run a single JSON health report before a scan or in CI:

```bash
bun run healthcheck
```

The report covers the threat feed, the configured secrets backend, and the
publish registry:

```json
{
	"threatFeed": {"configured": true, "source": "default", "reachable": true},
	"secretsBackend": {
		"provider": "bun-secrets",
		"backend": "keychain",
		"configured": true,
		"available": true
	},
	"registry": {
		"configured": true,
		"url": "https://registry.example.com",
		"reachable": true,
		"authenticated": true
	},
	"allHealthy": true
}
```

The command exits `0` when everything is healthy and non-zero otherwise. Use it
in CI to fail fast when the OS credential store is missing or the remote feed
is down:

```bash
bun run healthcheck --threat-feed-url https://threat.example.com/feed.json
```

To verify the tarball contents without actually publishing, use `--dry-run`:

```bash
bun publish --dry-run
```

### Publish from CI

Push a tag matching `v*`:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The `.github/workflows/publish.yml` action will run the quality gates and publish using the
`NPM_CONFIG_TOKEN` repository secret.

### Test locally before publishing

Use [`bun link`](https://bun.sh/docs/cli/link):

```bash
# In your scanner directory
bun link

# In your test project
bun link @acme/bun-security-scanner # this is the name in package.json of your scanner
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, feature flags,
domain/vault workflow, and pull request expectations.

## Support

For docs and questions, see the [Bun documentation](https://bun.com/docs/install/security-scanner-api) or [Join our Discord](https://bun.com/discord).

For template issues, please open an issue in this repository.
