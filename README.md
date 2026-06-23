<img src="https://bun.com/logo.png" height="36" />

# Bun Security Scanner Template

A template for creating a security scanner for Bun's package installation
process. Security scanners scan packages against your threat intelligence feeds
and control whether installations proceed based on detected threats.

📚 [**Full documentation**](https://bun.com/docs/install/security-scanner-api)

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

| Env var                     | CLI flag                      | Description                                                                          | Default                      |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ | ---------------------------- |
| `THREAT_FEED_STDIN`         | `--threat-feed-stdin`         | Read threat feed JSON from stdin.                                                    | —                            |
| `THREAT_FEED_URL`           | `--threat-feed-url`           | URL of a remote JSON threat feed.                                                    | —                            |
| `THREAT_FEED_PATH`          | `--threat-feed-path`          | Path to a local JSON threat feed file.                                               | —                            |
| `THREAT_FEED_TIMEOUT_MS`    | `--threat-feed-timeout-ms`    | Timeout for fetching the remote feed.                                                | `5000`                       |
| `THREAT_FEED_RETRIES`       | `--threat-feed-retries`       | Number of retries for remote feed requests.                                          | `2`                          |
| `THREAT_FEED_TOKEN_NAME`    | `--threat-feed-token-name`    | Keychain entry name for the remote feed bearer token. Opt-in to authenticated fetch. | —                            |
| `THREAT_FEED_TOKEN_SERVICE` | `--threat-feed-token-service` | Keychain service name for the token.                                                 | `@acme/bun-security-scanner` |
| `SCANNER_LOG_PATH`          | `--scanner-log-path`          | Append structured JSON events to this file.                                          | —                            |
| `SCANNER_LOG_STDERR`        | `--scanner-log-stderr`        | Emit structured events to stderr.                                                    | `0`                          |

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
  service: '@acme/bun-security-scanner',
  name: 'threat-feed-token',
  value: 'your-token-here',
})"
```

**Use it** — point the scanner at the name you stored:

```bash
THREAT_FEED_URL=https://threat.example.com/feed.json \
THREAT_FEED_TOKEN_NAME=threat-feed-token \
bun install
```

To use a non-default service name (e.g. a UTI for a published CLI), set
`THREAT_FEED_TOKEN_SERVICE`:

```bash
THREAT_FEED_TOKEN_SERVICE=com.acme.scanner \
THREAT_FEED_TOKEN_NAME=threat-feed-token \
bun install
```

Platform behavior follows `Bun.secrets`:

- **macOS**: Keychain Services (may prompt for access on first use)
- **Linux**: libsecret / GNOME Keyring / KWallet (must be running)
- **Windows**: Windows Credential Manager

In CI or other environments without a keychain, leave `THREAT_FEED_TOKEN_NAME`
unset and provide the feed via `THREAT_FEED_URL` to an unauthenticated endpoint,
or pipe it via `--threat-feed-stdin`.

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

This scanner is configured to publish to an internal, scoped registry. Update the
`publishConfig.registry` URL in `package.json` and the `.npmrc.example` file with your
real registry before publishing.

### One-time setup

1. Copy the registry template:

   ```bash
   cp .npmrc.example .npmrc
   ```

2. Edit `.npmrc` and replace `your-internal-registry.example.com` with your real registry.
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

This is a template repository. Fork it and customize for your organization's
security requirements.

## Support

For docs and questions, see the [Bun documentation](https://bun.com/docs/install/security-scanner-api) or [Join our Discord](https://bun.com/discord).

For template issues, please open an issue in this repository.
