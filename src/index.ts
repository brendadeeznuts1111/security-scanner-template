import {z} from 'zod';
import {parseArgs} from 'util';
import {mkdir} from 'fs/promises';
import path from 'path';
import {isOsCredentialStoreAvailable, detectSecretsBackend} from './secrets-backend.ts';
import {isJSONLSource, parseJSONLFeed, streamJSONLFeed} from './provider/feed-jsonl.ts';
import {colorize, TERMINAL} from './color/index.ts';
import {sleep} from './utils/rate-limit.ts';
import {filePathFromModuleUrl} from './utils/runtime.ts';
import {createTimer} from './utils/timing.ts';
import {satisfiesVersion} from './semver/index.ts';

const ThreatCategorySchema = z.enum([
	'protestware',
	'adware',
	'backdoor',
	'malware',
	'botnet',
	'token-stealer',
	'deprecated',
	'unmaintained',
]);

const ThreatFeedItemSchema = z.object({
	package: z.string(),
	range: z.string(),
	url: z.string().nullable(),
	description: z.string().nullable(),
	categories: z.array(ThreatCategorySchema),
	hashes: z.array(z.string()).optional(),
});

const AllowlistItemSchema = z.object({
	package: z.string(),
	range: z.string().default('*'),
	reason: z.string().optional(),
});

const ThreatFeedDocumentSchema = z.object({
	rules: z.array(ThreatFeedItemSchema),
	allowlist: z.array(AllowlistItemSchema).optional(),
});

const ThreatFeedInputSchema = z.union([z.array(ThreatFeedItemSchema), ThreatFeedDocumentSchema]);

const ThreatFeedSchema = z.array(ThreatFeedItemSchema);

function normalizeThreatFeed(data: unknown): {rules: ThreatFeedItem[]; allowlist: AllowlistItem[]} {
	const parsed = ThreatFeedInputSchema.parse(data);

	if (Array.isArray(parsed)) {
		return {rules: parsed, allowlist: []};
	}

	return {rules: parsed.rules, allowlist: parsed.allowlist ?? []};
}

type ThreatFeedItem = z.infer<typeof ThreatFeedItemSchema>;
type AllowlistItem = z.infer<typeof AllowlistItemSchema>;

const LOCAL_THREAT_FEED: ThreatFeedItem[] = [
	{
		package: 'event-stream',
		range: '>=3.3.6 <4.0.0',
		url: 'https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident',
		description: 'event-stream is a malicious package',
		categories: ['malware'],
	},
	// ...
];

const DEFAULT_RULES_PATH = filePathFromModuleUrl(
	new URL('../rules/security-rules.json', import.meta.url),
);

let defaultRulesCache: Promise<{rules: ThreatFeedItem[]; allowlist: AllowlistItem[]}> | null = null;

const DEFAULT_FETCH_TIMEOUT_MS = 5000;
const DEFAULT_FETCH_RETRIES = 2;

// --- Unified configuration: CLI flags (via Bun.argv) take precedence over env vars ---
// Parsed once at module load. strict:false so unknown args from the host process
// (e.g. `bun install --production`) don't throw when the scanner is loaded by Bun.

const cliArgs = parseArgs({
	args: Bun.argv,
	options: {
		'threat-feed-url': {type: 'string'},
		'threat-feed-path': {type: 'string'},
		'threat-feed-stdin': {type: 'boolean'},
		'threat-feed-timeout-ms': {type: 'string'},
		'threat-feed-retries': {type: 'string'},
		'threat-feed-token-service': {type: 'string'},
		'threat-feed-token-name': {type: 'string'},
		'threat-feed-token-provider': {type: 'string'},
		'threat-feed-cache-ttl': {type: 'string'},
		'store-token': {type: 'boolean'},
		'store-token-value': {type: 'string'},
		'clear-token': {type: 'boolean'},
		'list-token': {type: 'boolean'},
		'check-registry': {type: 'boolean'},
		'healthcheck': {type: 'boolean'},
		'json': {type: 'boolean'},
		'dry-run': {type: 'boolean'},
		'registry-url': {type: 'string'},
		'registry-username': {type: 'string'},
		'registry-password': {type: 'string'},
		'registry-auth-type': {type: 'string'},
		'scanner-log-path': {type: 'string'},
		'scanner-log-stderr': {type: 'boolean'},
		'console-depth': {type: 'string'},
	},
	strict: false,
	allowPositionals: true,
}).values;

function config(key: string, envVar: string): string | undefined {
	const cli = cliArgs[key];
	if (typeof cli === 'string' && cli.length > 0) return cli;
	return process.env[envVar];
}

function configFlag(key: string, envVar: string): boolean {
	if (cliArgs[key] === true) return true;
	return /^(1|true|yes)$/i.test(process.env[envVar] ?? '');
}

/**
 * Apply a custom console inspection depth for debugging. Bun exposes
 * `console.depth` to control how many levels `console.log` prints.
 */
function applyConsoleDepth(): void {
	const raw = config('console-depth', 'CONSOLE_DEPTH');
	if (!raw) return;
	const depth = Number(raw);
	if (Number.isInteger(depth) && depth >= 0) {
		(console as unknown as {depth: number}).depth = depth;
	}
}

function getFetchTimeoutMs(): number {
	const raw = config('threat-feed-timeout-ms', 'THREAT_FEED_TIMEOUT_MS');
	if (!raw) return DEFAULT_FETCH_TIMEOUT_MS;
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FETCH_TIMEOUT_MS;
}

function getFetchRetries(): number {
	const raw = config('threat-feed-retries', 'THREAT_FEED_RETRIES');
	if (!raw) return DEFAULT_FETCH_RETRIES;
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_FETCH_RETRIES;
}

// --- Remote feed authentication ---
//
// The scanner stays stateless: it does not store or manage credentials. It reads
// a token at fetch time from a configurable provider and sends it as a `Bearer`
// token in the `Authorization` header.
//
// Providers:
//   - `bun-secrets` (default): read from the OS keychain via Bun.secrets
//     (macOS Keychain / libsecret / Windows Credential Manager). Mostly useful
//     for local development tools; see https://bun.com/docs/runtime/secrets.
//   - `env`: read from the `THREAT_FEED_TOKEN` environment variable. This is
//     the preferred option for production deployment secrets, because the
//     Bun.secrets API is currently optimized for local CLI workflows.
//
// Opt-in: the `bun-secrets` provider requires a token name
// (`THREAT_FEED_TOKEN_NAME` / `--threat-feed-token-name`), so the scanner never
// touches the keychain unless the user explicitly opts in. The `env` provider
// is triggered by `THREAT_FEED_TOKEN_PROVIDER=env` plus a non-empty
// `THREAT_FEED_TOKEN`.

// Reverse-DNS service name per Bun.secrets best practices:
// https://bun.com/docs/runtime/secrets#best-practices
const DEFAULT_TOKEN_SERVICE = 'com.acme.bun-security-scanner';

// Name used for the pre-flight write probe in --store-token. The probe writes
// and immediately deletes this placeholder entry so keychain permission/lock
// problems are surfaced before the user is prompted for the real token.
const STORE_TEST_TOKEN_NAME = '__scanner_store_test__';

type TokenProvider = 'bun-secrets' | 'env';

function getTokenProvider(): TokenProvider {
	const raw = config('threat-feed-token-provider', 'THREAT_FEED_TOKEN_PROVIDER');
	if (raw === 'env') return 'env';
	if (raw && raw !== 'bun-secrets') {
		console.error(
			colorize(
				TERMINAL.scannerWarn,
				`[scanner] unknown token provider "${raw}", falling back to bun-secrets`,
			),
		);
	}
	return 'bun-secrets';
}

function getTokenService(): string {
	return config('threat-feed-token-service', 'THREAT_FEED_TOKEN_SERVICE') ?? DEFAULT_TOKEN_SERVICE;
}

function getTokenName(): string | null {
	const name = config('threat-feed-token-name', 'THREAT_FEED_TOKEN_NAME');
	return name && name.length > 0 ? name : null;
}

/**
 * Read the token from the environment. Used by the `env` provider so the token
 * can be injected via production secret management without touching the OS
 * keychain.
 */
function getEnvThreatFeedToken(): string | null {
	const token = process.env.THREAT_FEED_TOKEN;
	return token && token.length > 0 ? token : null;
}

/**
 * Resolve the remote-feed bearer token from the configured provider. Returns
 * null when token auth is not opted in or when the configured provider is
 * unavailable. Never throws — a missing token degrades gracefully to an
 * unauthenticated request.
 */
async function getThreatFeedToken(): Promise<string | null> {
	const provider = getTokenProvider();

	if (provider === 'env') {
		const token = getEnvThreatFeedToken();
		if (!token) {
			console.error(
				colorize(
					TERMINAL.scannerWarn,
					'[scanner] THREAT_FEED_TOKEN_PROVIDER=env but THREAT_FEED_TOKEN is not set; sending unauthenticated request',
				),
			);
		}
		return token;
	}

	const name = getTokenName();
	if (!name) return null;
	const service = getTokenService();

	if (!(await isOsCredentialStoreAvailable())) {
		console.error(
			colorize(
				TERMINAL.scannerFatal,
				'[scanner] bun-secrets provider is selected but the OS credential store is unreachable. Set THREAT_FEED_TOKEN_PROVIDER=env and provide THREAT_FEED_TOKEN.',
			),
		);
		process.exit(1);
	}

	try {
		return await Bun.secrets.get({service, name});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			colorize(
				TERMINAL.scannerWarn,
				`[scanner] could not read threat-feed token from Bun.secrets (${service}/${name}): ${message}`,
			),
		);
		return null;
	}
}

function isEventLoggingEnabled(): boolean {
	return (
		Boolean(config('scanner-log-path', 'SCANNER_LOG_PATH')) ||
		configFlag('scanner-log-stderr', 'SCANNER_LOG_STDERR')
	);
}

function getLogPath(): string | null {
	const path = config('scanner-log-path', 'SCANNER_LOG_PATH');
	return path ? path : null;
}

function formatEventForStderr(event: ScannerEvent): string {
	switch (event.type) {
		case 'scan.start':
			return colorize(
				TERMINAL.scannerInfo,
				`[scanner] scan started: ${event.packageCount} package(s)`,
			);
		case 'feed.loaded':
			return colorize(
				TERMINAL.scannerDim,
				`[scanner] feed loaded (${event.source}): ${event.ruleCount} rule(s), ${event.allowlistCount} allowlist entr${event.allowlistCount === 1 ? 'y' : 'ies'}`,
			);
		case 'threat.detected': {
			const c = event.level === 'fatal' ? TERMINAL.scannerFatal : TERMINAL.scannerWarn;
			const label = event.level.toUpperCase();
			const pkg = event.version ? `${event.package}@${event.version}` : event.package;
			const cats = event.categories.join(', ');
			const hash = event.hashVerified ? ' [hash verified]' : '';
			return colorize(c, `[scanner] ${label} ${pkg} — ${cats}${hash}`);
		}
		case 'threat.allowed': {
			const pkg = event.version ? `${event.package}@${event.version}` : event.package;
			const reason = event.reason ? ` — ${event.reason}` : '';
			return colorize(TERMINAL.scannerOk, `[scanner] ALLOWED ${pkg}${reason}`);
		}
		case 'scan.complete': {
			const dryRunNote = event.dryRun ? ' (dry run)' : '';
			return colorize(
				TERMINAL.scannerInfo,
				`[scanner] scan complete${dryRunNote}: ${event.advisoryCount} advisory(ies), ${event.allowedCount} allowed (${event.durationMs}ms)`,
			);
		}
	}
}

type EventLogWriter = ReturnType<ReturnType<typeof Bun.file>['writer']>;

let eventLogWriter: EventLogWriter | null = null;
let eventLogWriterPath: string | null = null;

function getEventLogWriter(): EventLogWriter | null {
	const path = getLogPath();
	if (!path) return null;
	// Re-open if the configured path changed (e.g. between scans / in tests).
	if (eventLogWriter && eventLogWriterPath !== path) {
		closeEventLogWriter();
	}
	if (!eventLogWriter) {
		eventLogWriter = Bun.file(path).writer();
		eventLogWriterPath = path;
	}
	return eventLogWriter;
}

/**
 * Flush and close the event log writer. Safe to call when no writer is open.
 * Exposed so long-lived hosts (and tests) can release the file handle.
 */
export function closeEventLogWriter(): void {
	if (eventLogWriter) {
		try {
			eventLogWriter.end();
		} catch {
			/* ignore errors closing the log writer */
		}
		eventLogWriter = null;
		eventLogWriterPath = null;
	}
}

type ScannerEvent =
	| {
			type: 'scan.start';
			packageCount: number;
			timestamp: string;
	  }
	| {
			type: 'feed.loaded';
			source: 'remote' | 'local' | 'stdin' | 'default' | 'cache';
			ruleCount: number;
			allowlistCount: number;
			timestamp: string;
	  }
	| {
			type: 'threat.detected';
			level: 'fatal' | 'warn';
			package: string;
			version?: string;
			categories: string[];
			hashVerified: boolean;
			timestamp: string;
	  }
	| {
			type: 'threat.allowed';
			package: string;
			version?: string;
			reason?: string;
			timestamp: string;
	  }
	| {
			type: 'scan.complete';
			advisoryCount: number;
			allowedCount: number;
			durationMs: number;
			timestamp: string;
			dryRun?: boolean;
	  };

async function emitEvent(event: ScannerEvent): Promise<void> {
	if (!isEventLoggingEnabled()) return;

	const stderrEnabled = configFlag('scanner-log-stderr', 'SCANNER_LOG_STDERR');

	if (stderrEnabled) {
		// Human-readable, colorized line for terminal consumption.
		console.error(formatEventForStderr(event));
	}

	// Machine-readable JSON line for the log file.
	const writer = getEventLogWriter();
	if (writer) {
		try {
			writer.write(`${JSON.stringify(event)}\n`);
			await writer.flush();
		} catch (error) {
			// Never let a logging failure crash the scan / block installation.
			console.error(
				colorize(TERMINAL.scannerFatal, `[scanner] failed to write event log: ${error}`),
			);
		}
	}
}

async function fetchWithTimeoutAndRetry(
	url: string,
	timeoutMs = getFetchTimeoutMs(),
	retries = getFetchRetries(),
	headers: Record<string, string> = {},
): Promise<Response> {
	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= retries; attempt++) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(url, {signal: controller.signal, headers});
			clearTimeout(timeoutId);
			return response;
		} catch (error) {
			clearTimeout(timeoutId);
			lastError = error instanceof Error ? error : new Error(String(error));
			if (attempt < retries) {
				await sleep(250 * (attempt + 1));
			}
		}
	}

	throw lastError;
}

const DEFAULT_CACHE_TTL_MS = 0;

function getThreatFeedCacheTtlMs(): number {
	const raw = config('threat-feed-cache-ttl', 'THREAT_FEED_CACHE_TTL');
	if (!raw) return DEFAULT_CACHE_TTL_MS;
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_CACHE_TTL_MS;
}

function getThreatFeedCacheDir(): string {
	const xdg = process.env.XDG_CACHE_HOME;
	if (xdg) return path.join(xdg, 'bun-security-scanner');
	return path.join(process.cwd(), 'node_modules', '.cache', 'bun-security-scanner');
}

function getThreatFeedCachePath(url: string): string {
	const hash = new Bun.CryptoHasher('sha256').update(url).digest('hex');
	return path.join(getThreatFeedCacheDir(), `feed-${hash}.json`);
}

type CachedThreatFeed = {
	url: string;
	fetchedAt: number;
	rules: ThreatFeedItem[];
	allowlist: AllowlistItem[];
};

async function readCachedThreatFeed(url: string, ttlMs: number): Promise<CachedThreatFeed | null> {
	if (ttlMs <= 0) return null;
	const cachePath = getThreatFeedCachePath(url);
	const file = Bun.file(cachePath);
	if (!(await file.exists())) return null;

	try {
		const cached = (await file.json()) as CachedThreatFeed;
		if (cached.url !== url) return null;
		const ageMs = Date.now() - cached.fetchedAt;
		if (ageMs > ttlMs) return null;
		return cached;
	} catch {
		return null;
	}
}

async function writeCachedThreatFeed(
	url: string,
	feed: {rules: ThreatFeedItem[]; allowlist: AllowlistItem[]},
): Promise<void> {
	const cacheDir = getThreatFeedCacheDir();
	try {
		await mkdir(cacheDir, {recursive: true});
	} catch {
		return;
	}

	const cachePath = getThreatFeedCachePath(url);
	const cached: CachedThreatFeed = {
		url,
		fetchedAt: Date.now(),
		rules: feed.rules,
		allowlist: feed.allowlist,
	};
	try {
		await Bun.write(cachePath, JSON.stringify(cached));
	} catch {
		/* ignore cache write errors */
	}
}

async function fetchRemoteThreatFeedDirect(
	url: string,
): Promise<{rules: ThreatFeedItem[]; allowlist: AllowlistItem[]}> {
	const token = await getThreatFeedToken();
	const headers: Record<string, string> = {};
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}

	const response = await fetchWithTimeoutAndRetry(url, undefined, undefined, headers);

	if (!response.ok) {
		throw new Error(`Threat feed request failed: ${response.status} ${response.statusText}`);
	}

	const feed = isJSONLSource(url)
		? await streamJSONLFeed(response)
		: normalizeThreatFeed(await response.json());

	await emitEvent({
		type: 'feed.loaded',
		source: 'remote',
		ruleCount: feed.rules.length,
		allowlistCount: feed.allowlist.length,
		timestamp: new Date().toISOString(),
	});

	return feed;
}

async function fetchRemoteThreatFeed(
	url: string,
): Promise<{rules: ThreatFeedItem[]; allowlist: AllowlistItem[]}> {
	const ttlMs = getThreatFeedCacheTtlMs();
	const cached = await readCachedThreatFeed(url, ttlMs);

	if (cached) {
		const ageMs = Date.now() - cached.fetchedAt;
		console.error(
			colorize(
				TERMINAL.scannerInfo,
				`[scanner] using cached threat feed (${Math.round(ageMs / 1000)}s old)`,
			),
		);
		// Refresh the cache in the background so the next scan has fresh data.
		fetchRemoteThreatFeedDirect(url)
			.then(feed => writeCachedThreatFeed(url, feed))
			.catch(() => {
				/* ignore background refresh errors */
			});

		await emitEvent({
			type: 'feed.loaded',
			source: 'cache',
			ruleCount: cached.rules.length,
			allowlistCount: cached.allowlist.length,
			timestamp: new Date().toISOString(),
		});

		return {rules: cached.rules, allowlist: cached.allowlist};
	}

	const feed = await fetchRemoteThreatFeedDirect(url);
	await writeCachedThreatFeed(url, feed);
	return feed;
}

async function loadLocalThreatFeed(
	path: string,
): Promise<{rules: ThreatFeedItem[]; allowlist: AllowlistItem[]}> {
	const file = Bun.file(path);
	const text = await file.text();

	const feed = isJSONLSource(path) ? parseJSONLFeed(text) : normalizeThreatFeed(JSON.parse(text));

	await emitEvent({
		type: 'feed.loaded',
		source: 'local',
		ruleCount: feed.rules.length,
		allowlistCount: feed.allowlist.length,
		timestamp: new Date().toISOString(),
	});

	return feed;
}

/**
 * Read a threat feed from stdin. Supports both plain JSON and JSONL.
 * Only called when --threat-feed-stdin / THREAT_FEED_STDIN is explicitly set,
 * so this won't interfere with `bun install` piping.
 */
async function loadStdinThreatFeed(): Promise<{
	rules: ThreatFeedItem[];
	allowlist: AllowlistItem[];
}> {
	const text = await Bun.stdin.text();

	let feed: {rules: ThreatFeedItem[]; allowlist: AllowlistItem[]};
	try {
		feed = normalizeThreatFeed(JSON.parse(text));
	} catch (error) {
		// Only fall back to JSONL when the input is not valid JSON. If the JSON
		// is valid but fails schema validation, propagate the error.
		if (error instanceof SyntaxError) {
			feed = parseJSONLFeed(text);
		} else {
			throw error;
		}
	}

	await emitEvent({
		type: 'feed.loaded',
		source: 'stdin',
		ruleCount: feed.rules.length,
		allowlistCount: feed.allowlist.length,
		timestamp: new Date().toISOString(),
	});

	return feed;
}

async function loadDefaultRulesInternal(): Promise<{
	rules: ThreatFeedItem[];
	allowlist: AllowlistItem[];
}> {
	const file = Bun.file(DEFAULT_RULES_PATH);

	if (!(await file.exists())) {
		return {rules: LOCAL_THREAT_FEED, allowlist: []};
	}

	try {
		const data = await file.json();
		const feed = normalizeThreatFeed(data);

		await emitEvent({
			type: 'feed.loaded',
			source: 'default',
			ruleCount: feed.rules.length,
			allowlistCount: feed.allowlist.length,
			timestamp: new Date().toISOString(),
		});

		return feed;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			colorize(
				TERMINAL.scannerFatal,
				`[scanner] failed to load default rules from ${DEFAULT_RULES_PATH}: ${message}`,
			),
		);
		return {rules: LOCAL_THREAT_FEED, allowlist: []};
	}
}

async function loadDefaultRules(): Promise<{rules: ThreatFeedItem[]; allowlist: AllowlistItem[]}> {
	if (!defaultRulesCache) {
		defaultRulesCache = loadDefaultRulesInternal();
	}

	return defaultRulesCache;
}

/**
 * Fetch the threat feed from stdin, a configured URL, a local file path, or
 * finally the bundled default rules file. Responses are validated with Zod;
 * the hardcoded local feed is the last-resort fallback.
 *
 * Precedence: --threat-feed-stdin → --threat-feed-url → --threat-feed-path
 *             → rules/security-rules.json → hardcoded fallback.
 */
async function fetchThreatFeed(): Promise<{rules: ThreatFeedItem[]; allowlist: AllowlistItem[]}> {
	if (configFlag('threat-feed-stdin', 'THREAT_FEED_STDIN')) {
		return loadStdinThreatFeed();
	}

	const url = config('threat-feed-url', 'THREAT_FEED_URL');
	const path = config('threat-feed-path', 'THREAT_FEED_PATH');

	if (url) {
		return fetchRemoteThreatFeed(url);
	}

	if (path) {
		return loadLocalThreatFeed(path);
	}

	return loadDefaultRules();
}

function isAllowed(pkg: Bun.Security.Package, allowlist: AllowlistItem[]): AllowlistItem | null {
	for (const entry of allowlist) {
		if (entry.package === pkg.name && satisfiesVersion(pkg.version, entry.range)) {
			return entry;
		}
	}
	return null;
}

function findThreats(
	packages: Bun.Security.Package[],
	feed: ThreatFeedItem[],
	allowlist: AllowlistItem[],
): {item: ThreatFeedItem; matchingPackages: Bun.Security.Package[]}[] {
	const result: {item: ThreatFeedItem; matchingPackages: Bun.Security.Package[]}[] = [];

	for (const item of feed) {
		const matchingPackages = packages.filter(
			p =>
				p.name === item.package &&
				satisfiesVersion(p.version, item.range) &&
				!isAllowed(p, allowlist),
		);

		if (matchingPackages.length > 0) {
			result.push({item, matchingPackages});
		}
	}

	return result;
}

function categorize(item: ThreatFeedItem): 'fatal' | 'warn' | null {
	const isFatal =
		item.categories.includes('malware') ||
		item.categories.includes('backdoor') ||
		item.categories.includes('botnet');

	const isWarning =
		item.categories.includes('protestware') ||
		item.categories.includes('adware') ||
		item.categories.includes('deprecated');

	if (isFatal) return 'fatal';
	if (isWarning) return 'warn';
	return null;
}

async function sha256Hex(input: Blob | ArrayBuffer | Uint8Array | string): Promise<string> {
	const buffer = input instanceof Blob ? await input.arrayBuffer() : input;
	const hasher = new Bun.CryptoHasher('sha256');
	hasher.update(buffer);
	return hasher.digest('hex');
}

async function hashMatches(
	packageInfo: Bun.Security.Package,
	blockedHashes: string[],
): Promise<boolean> {
	if (!packageInfo.tarball || blockedHashes.length === 0) {
		return false;
	}

	const response = await fetchWithTimeoutAndRetry(packageInfo.tarball);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch tarball for ${packageInfo.name}: ${response.status} ${response.statusText}`,
		);
	}

	const blob = await response.blob();
	const hash = await sha256Hex(blob);
	return blockedHashes.includes(hash);
}

/**
 * Find matching threats and, for feed items that include a list of blocked
 * hashes, verify the actual package tarball hash before reporting. This prevents
 * false positives when a package version has been republished with a fix.
 */
async function findThreatsWithHashes(
	packages: Bun.Security.Package[],
	feed: ThreatFeedItem[],
	allowlist: AllowlistItem[],
): Promise<
	{item: ThreatFeedItem; matchingPackages: Bun.Security.Package[]; hashVerified: boolean}[]
> {
	const matched = findThreats(packages, feed, allowlist);
	const results: {
		item: ThreatFeedItem;
		matchingPackages: Bun.Security.Package[];
		hashVerified: boolean;
	}[] = [];

	for (const {item, matchingPackages} of matched) {
		const level = categorize(item);
		if (!level) continue;

		// If no hashes are specified, report based on name/version range alone.
		if (!item.hashes || item.hashes.length === 0) {
			results.push({item, matchingPackages, hashVerified: false});
			continue;
		}

		// If hashes are specified, only report when a matching package tarball
		// hash is confirmed.
		let verified = false;
		for (const pkg of matchingPackages) {
			if (await hashMatches(pkg, item.hashes)) {
				verified = true;
				break;
			}
		}

		if (verified) {
			results.push({item, matchingPackages, hashVerified: true});
		}
	}

	return results;
}

export const scannerCapabilities = {
	version: '1.0.0',
	apiVersion: '1',
	supports: [
		'remote-threat-feed',
		'local-threat-feed',
		'stdin-threat-feed',
		'jsonl-streaming-feed',
		'tarball-hash-verification',
		'timeout-and-retry',
		'zod-validation',
		'allowlist-policy',
		'structured-event-emission',
	],
	categories: [
		'protestware',
		'adware',
		'backdoor',
		'malware',
		'botnet',
		'token-stealer',
		'deprecated',
		'unmaintained',
	],
};

export const scanner: Bun.Security.Scanner = {
	version: '1',
	async scan({packages}) {
		const timer = createTimer();
		const {rules, allowlist} = await fetchThreatFeed();

		await emitEvent({
			type: 'scan.start',
			packageCount: packages.length,
			timestamp: new Date().toISOString(),
		});

		const pendingEvents: Promise<void>[] = [];
		const safeEmit = (event: ScannerEvent) => {
			pendingEvents.push(
				emitEvent(event).catch(() => {
					/* ignore logging errors */
				}),
			);
		};

		const allowedPackages = packages.filter(p => {
			const entry = isAllowed(p, allowlist);
			if (entry) {
				safeEmit({
					type: 'threat.allowed',
					package: p.name,
					version: p.version,
					reason: entry.reason,
					timestamp: new Date().toISOString(),
				});
				return true;
			}
			return false;
		});

		const dryRun = configFlag('dry-run', 'DRY_RUN');
		const threats = await findThreatsWithHashes(packages, rules, allowlist);
		const results: Bun.Security.Advisory[] = [];

		for (const {item, matchingPackages, hashVerified} of threats) {
			let level = categorize(item);
			if (!level) continue;
			if (dryRun && level === 'fatal') {
				level = 'warn';
			}

			for (const pkg of matchingPackages) {
				safeEmit({
					type: 'threat.detected',
					level,
					package: pkg.name,
					version: pkg.version,
					categories: item.categories,
					hashVerified,
					timestamp: new Date().toISOString(),
				});
			}

			results.push({
				level,
				package: item.package,
				url: item.url,
				description: item.description,
				categories: item.categories,
				hashVerified,
			});
		}

		// Drain detection/allowance events so they are ordered before scan.complete.
		await Promise.all(pendingEvents);

		await emitEvent({
			type: 'scan.complete',
			advisoryCount: results.length,
			allowedCount: allowedPackages.length,
			durationMs: timer.elapsedMs(),
			timestamp: new Date().toISOString(),
			dryRun,
		});

		closeEventLogWriter();

		if (cliArgs['json'] === true) {
			console.log(JSON.stringify(results, null, 2));
		}

		return results;
	},
};

// --- Registry health check helper ---
//
// Before publishing, verify the configured private registry is reachable and
// that the configured credentials are accepted. This catches network, URL, and
// credential issues without attempting an actual publish.
//
//   bun run src/index.ts --check-registry
//   bun run src/index.ts --check-registry --registry-url https://registry.example.com
//   NPM_CONFIG_TOKEN=xxx bun run src/index.ts --check-registry
//   REGISTRY_AUTH_TYPE=basic REGISTRY_USERNAME=foo REGISTRY_PASSWORD=bar bun run src/index.ts --check-registry

type RegistryAuthType = 'bearer' | 'basic';

const PACKAGE_JSON_PATH = filePathFromModuleUrl(new URL('../package.json', import.meta.url));

async function getPublishRegistry(): Promise<string | null> {
	try {
		const pkg = await Bun.file(PACKAGE_JSON_PATH).json();
		return pkg?.publishConfig?.registry ?? null;
	} catch {
		return null;
	}
}

async function getRegistryUrl(): Promise<string | null> {
	const fromCli = config('registry-url', 'REGISTRY_URL');
	if (fromCli) return fromCli;
	return getPublishRegistry();
}

function getRegistryAuthType(): RegistryAuthType {
	const explicit = config('registry-auth-type', 'REGISTRY_AUTH_TYPE')?.toLowerCase();
	if (explicit === 'basic' || explicit === 'bearer') return explicit;
	// Default: bearer when a token is available, basic when username/password are provided.
	if (process.env.NPM_CONFIG_TOKEN) return 'bearer';
	if (
		config('registry-username', 'REGISTRY_USERNAME') &&
		config('registry-password', 'REGISTRY_PASSWORD')
	) {
		return 'basic';
	}
	return 'bearer';
}

function getRegistryCredentials(): {token?: string; username?: string; password?: string} {
	return {
		token: process.env.NPM_CONFIG_TOKEN,
		username: config('registry-username', 'REGISTRY_USERNAME'),
		password: config('registry-password', 'REGISTRY_PASSWORD'),
	};
}

function buildRegistryAuthHeaders(
	authType: RegistryAuthType,
	credentials: {token?: string; username?: string; password?: string},
): Record<string, string> {
	const headers: Record<string, string> = {};
	if (authType === 'bearer') {
		if (credentials.token) {
			headers['Authorization'] = `Bearer ${credentials.token}`;
		}
	} else if (authType === 'basic' && credentials.username && credentials.password) {
		headers['Authorization'] =
			`Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;
	}
	return headers;
}

function formatRegistryAuthMethod(authType: RegistryAuthType): string {
	return authType === 'basic' ? 'basic auth' : 'bearer token';
}

async function runRegistryCheck(): Promise<void> {
	if (cliArgs['check-registry'] !== true) return;

	const registryUrl = await getRegistryUrl();
	if (!registryUrl) {
		console.error(
			colorize(
				TERMINAL.scannerFatal,
				'[scanner] no registry URL configured. Set --registry-url, REGISTRY_URL, or publishConfig.registry in package.json',
			),
		);
		process.exit(1);
	}

	const authType = getRegistryAuthType();
	const credentials = getRegistryCredentials();
	const headers = buildRegistryAuthHeaders(authType, credentials);
	const hasCredentials = Object.keys(headers).length > 0;

	console.error(colorize(TERMINAL.scannerInfo, `[scanner] checking registry: ${registryUrl}`));

	try {
		const response = await fetchWithTimeoutAndRetry(registryUrl, 5000, 1, headers);
		if (response.ok) {
			console.error(
				colorize(TERMINAL.scannerOk, `[scanner] registry reachable (${response.status})`),
			);
			if (hasCredentials) {
				console.error(
					colorize(
						TERMINAL.scannerOk,
						`[scanner] registry ${formatRegistryAuthMethod(authType)} accepted`,
					),
				);
			} else {
				console.error(
					colorize(
						TERMINAL.scannerWarn,
						'[scanner] no registry credentials set; publish will fail in CI',
					),
				);
			}
			process.exit(0);
		}
		if (response.status === 401) {
			console.error(
				colorize(TERMINAL.scannerFatal, '[scanner] registry returned 401 Unauthorized'),
			);
			if (!hasCredentials) {
				console.error(colorize(TERMINAL.scannerWarn, '[scanner] no registry credentials set'));
			} else {
				console.error(
					colorize(
						TERMINAL.scannerWarn,
						`[scanner] provided ${formatRegistryAuthMethod(authType)} was rejected`,
					),
				);
			}
			process.exit(1);
		}
		console.error(
			colorize(
				TERMINAL.scannerFatal,
				`[scanner] registry returned ${response.status} ${response.statusText}`,
			),
		);
		process.exit(1);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(colorize(TERMINAL.scannerFatal, `[scanner] registry check failed: ${message}`));
		process.exit(1);
	}
}

// --- Health check helper ---
//
// Pre-flight check for CI/operators: reports threat-feed, secrets-backend, and
// registry status as JSON and exits non-zero if anything is unhealthy.
//
//   bun run src/index.ts --healthcheck
//   bun run src/index.ts --healthcheck --threat-feed-url https://example.com/feed.json

type ThreatFeedHealth = {
	configured: boolean;
	source?: 'remote' | 'local' | 'stdin' | 'default';
	url?: string;
	reachable?: boolean;
	error?: string;
};

type SecretsBackendHealth = {
	provider: TokenProvider;
	backend?: string;
	configured: boolean;
	available: boolean;
	error?: string;
};

type RegistryHealth = {
	configured: boolean;
	url?: string;
	reachable?: boolean;
	authenticated?: boolean;
	error?: string;
};

type HealthStatus = {
	threatFeed: ThreatFeedHealth;
	secretsBackend: SecretsBackendHealth;
	registry: RegistryHealth;
	allHealthy: boolean;
};

async function getThreatFeedHealth(): Promise<ThreatFeedHealth> {
	const url = config('threat-feed-url', 'THREAT_FEED_URL');
	const path = config('threat-feed-path', 'THREAT_FEED_PATH');
	const stdin = cliArgs['threat-feed-stdin'] === true;

	if (url) {
		const token = await getThreatFeedToken();
		const headers: Record<string, string> = {};
		if (token) headers['Authorization'] = `Bearer ${token}`;

		try {
			const response = await fetchWithTimeoutAndRetry(url, 5000, 1, headers);
			return {
				configured: true,
				source: 'remote',
				url,
				reachable: response.ok,
				error: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`,
			};
		} catch (error) {
			return {
				configured: true,
				source: 'remote',
				url,
				reachable: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	if (path) {
		try {
			await Bun.file(path).text();
			return {configured: true, source: 'local', reachable: true};
		} catch (error) {
			return {
				configured: true,
				source: 'local',
				reachable: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	if (stdin) {
		return {configured: true, source: 'stdin'};
	}

	return {configured: true, source: 'default', reachable: true};
}

async function getSecretsBackendHealth(): Promise<SecretsBackendHealth> {
	const provider = getTokenProvider();

	if (provider === 'env') {
		const token = config('threat-feed-token', 'THREAT_FEED_TOKEN');
		return {
			provider: 'env',
			configured: typeof token === 'string' && token.length > 0,
			available: true,
		};
	}

	const info = await detectSecretsBackend();
	const name = getTokenName();
	const service = getTokenService();

	let configured = false;
	if (info.available && name) {
		try {
			const value = await Bun.secrets.get({service, name});
			configured = value !== null;
		} catch {
			configured = false;
		}
	}

	return {
		provider: 'bun-secrets',
		backend: info.backend,
		configured,
		available: info.available,
		error: info.error,
	};
}

async function getRegistryHealth(): Promise<RegistryHealth> {
	const registryUrl = await getRegistryUrl();
	if (!registryUrl) {
		return {configured: false};
	}

	const authType = getRegistryAuthType();
	const credentials = getRegistryCredentials();
	const headers = buildRegistryAuthHeaders(authType, credentials);
	const hasCredentials = Object.keys(headers).length > 0;

	try {
		const response = await fetchWithTimeoutAndRetry(registryUrl, 5000, 1, headers);
		return {
			configured: true,
			url: registryUrl,
			reachable: response.ok,
			authenticated: hasCredentials ? response.ok : undefined,
			error: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`,
		};
	} catch (error) {
		return {
			configured: true,
			url: registryUrl,
			reachable: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

async function getHealthStatus(): Promise<HealthStatus> {
	const [threatFeed, secretsBackend, registry] = await Promise.all([
		getThreatFeedHealth(),
		getSecretsBackendHealth(),
		getRegistryHealth(),
	]);

	const allHealthy =
		(threatFeed.reachable ?? true) && secretsBackend.available && (registry.reachable ?? true);

	return {threatFeed, secretsBackend, registry, allHealthy};
}

async function withSpinner<T>(message: string, fn: () => Promise<T>): Promise<T> {
	const showProgress = Boolean(process.stderr.isTTY);
	if (showProgress) {
		process.stderr.write(`${message}… `);
	}
	try {
		const result = await fn();
		if (showProgress) {
			process.stderr.write('✅\n');
		}
		return result;
	} catch (error) {
		if (showProgress) {
			process.stderr.write('❌\n');
		}
		throw error;
	}
}

async function runHealthCheck(): Promise<void> {
	if (cliArgs['healthcheck'] !== true) return;

	let threatFeed: ThreatFeedHealth;
	let secretsBackend: SecretsBackendHealth;
	let registry: RegistryHealth;

	if (process.stderr.isTTY) {
		console.error(colorize(TERMINAL.scannerInfo, 'Running health checks…'));
		threatFeed = await withSpinner('🔍 Threat feed', getThreatFeedHealth);
		secretsBackend = await withSpinner('🔐 Secrets backend', getSecretsBackendHealth);
		registry = await withSpinner('📦 Registry', getRegistryHealth);
	} else {
		const status = await getHealthStatus();
		threatFeed = status.threatFeed;
		secretsBackend = status.secretsBackend;
		registry = status.registry;
	}

	const allHealthy =
		(threatFeed.reachable ?? true) && secretsBackend.available && (registry.reachable ?? true);

	const status: HealthStatus = {threatFeed, secretsBackend, registry, allHealthy};
	console.log(JSON.stringify(status, null, 2));
	process.exit(status.allHealthy ? 0 : 1);
}

// --- Token management CLI helpers (Bun.secrets.set / .delete) ---
//
// When the scanner is run directly (not loaded by `bun install`), these flags
// let users store or clear the remote-feed bearer token in the OS keychain
// without writing a one-off `bun -e` snippet. They use Bun.secrets directly
// per https://bun.com/docs/runtime/secrets#api.
//
//   bun run src/index.ts --store-token --threat-feed-token-name threat-feed-token
//   bun run src/index.ts --store-token --threat-feed-token-name threat-feed-token --store-token-value ghp_xxx
//   bun run src/index.ts --clear-token --threat-feed-token-name threat-feed-token
//
// `--threat-feed-token-service` overrides the default service name. When
// `--store-token-value` is omitted, the user is prompted interactively (input
// is hidden on supporting terminals).

/**
 * Perform a harmless write-then-delete probe against the OS credential store.
 * This is used by --store-token to detect a locked keyring or missing write
 * permission before the user is asked for the real token.
 *
 * The probe writes a placeholder value under the configured service and the
 * well-known name STORE_TEST_TOKEN_NAME, then deletes it immediately. If the
 * delete step fails, we emit a warning but do not block the real store operation.
 */
async function testKeychainWrite(
	service: string,
): Promise<{ok: true} | {ok: false; error: string}> {
	try {
		await Bun.secrets.set({service, name: STORE_TEST_TOKEN_NAME, value: 'probe'});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, error: message};
	}

	try {
		const deleted = await Bun.secrets.delete({service, name: STORE_TEST_TOKEN_NAME});
		if (!deleted) {
			console.error(
				colorize(
					TERMINAL.scannerWarn,
					`[scanner] keychain write probe cleanup returned false (${service}/${STORE_TEST_TOKEN_NAME}); the probe entry may remain in the keychain`,
				),
			);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			colorize(
				TERMINAL.scannerWarn,
				`[scanner] keychain write probe cleanup failed (${service}/${STORE_TEST_TOKEN_NAME}): ${message}`,
			),
		);
	}

	return {ok: true};
}

async function runTokenCli(): Promise<void> {
	const name = getTokenName();
	const service = getTokenService();
	const provider = getTokenProvider();

	// The token CLI commands manage the OS keychain via Bun.secrets. They are
	// meaningless when the fetch-time provider is `env`, so fail loudly.
	if (
		cliArgs['store-token'] === true ||
		cliArgs['clear-token'] === true ||
		cliArgs['list-token'] === true
	) {
		if (provider !== 'bun-secrets') {
			console.error(
				colorize(
					TERMINAL.scannerFatal,
					`[scanner] token CLI commands only support the bun-secrets provider (got ${provider}). Switch provider or omit the token CLI flag.`,
				),
			);
			process.exit(1);
		}
	}

	// Bun.secrets is experimental and absent on older Bun runtimes. The fetch
	// path degrades gracefully via try/catch, but the CLI helpers are explicit
	// user actions — fail loudly with a clear message instead of a TypeError.
	if (typeof Bun.secrets === 'undefined') {
		console.error(
			colorize(
				TERMINAL.scannerFatal,
				'[scanner] Bun.secrets is not available in this Bun runtime; upgrade to a version that supports it (see https://bun.com/docs/runtime/secrets).',
			),
		);
		process.exit(1);
	}

	if (cliArgs['store-token'] === true) {
		if (!name) {
			console.error(
				colorize(
					TERMINAL.scannerFatal,
					'[scanner] --store-token requires --threat-feed-token-name (or THREAT_FEED_TOKEN_NAME)',
				),
			);
			process.exit(1);
		}

		// Pre-flight write probe: make sure the keychain/keyring is writable before
		// asking the user for the real token. This surfaces permission prompts or
		// locked keyrings early, avoiding wasted input.
		const probe = await testKeychainWrite(service);
		if (!probe.ok) {
			console.error(
				colorize(
					TERMINAL.scannerFatal,
					`[scanner] keychain write probe failed (${service}/${STORE_TEST_TOKEN_NAME}): ${probe.error}`,
				),
			);
			console.error(
				colorize(
					TERMINAL.scannerWarn,
					'[scanner] Check that your keychain/keyring is unlocked and the scanner has permission to write credentials.',
				),
			);
			process.exit(1);
		}

		let value: string | undefined =
			typeof cliArgs['store-token-value'] === 'string' ? cliArgs['store-token-value'] : undefined;

		if (!value) {
			// prompt() is Bun's built-in readline helper. On TTY-less environments
			// (e.g. CI) it returns null; fall back to reading from stdin so
			// `echo $TOKEN | bun run ... --store-token` works non-interactively.
			value = prompt(`Enter token for ${service}/${name}:`) ?? undefined;
		}

		if (!value) {
			// prompt() returned null (non-TTY) — use Bun's console async iterator
			// to read stdin line-by-line. This works for both piped input and
			// interactive paste, and it doesn't block until EOF like Bun.stdin.text().
			console.error(
				colorize(
					TERMINAL.scannerInfo,
					`Enter token for ${service}/${name} (paste, then press Enter on a blank line or Ctrl+D to finish):`,
				),
			);

			let stdinToken = '';
			try {
				for await (const line of console) {
					if (line === '') break; // blank line ends interactive input
					stdinToken += line.trim();
				}
			} catch {
				// console iteration error; fall through to "no token provided" below.
			}

			if (stdinToken.length > 0) value = stdinToken;
		}

		if (!value || value.length === 0) {
			console.error(colorize(TERMINAL.scannerFatal, '[scanner] no token provided, aborting.'));
			process.exit(1);
		}

		try {
			await Bun.secrets.set({service, name, value});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(
				colorize(
					TERMINAL.scannerFatal,
					`[scanner] could not store token in keychain (${service}/${name}): ${message}`,
				),
			);
			process.exit(1);
		}
		console.error(
			colorize(TERMINAL.scannerOk, `[scanner] token stored in keychain (${service}/${name})`),
		);
		process.exit(0);
	}

	if (cliArgs['clear-token'] === true) {
		if (!name) {
			console.error(
				colorize(
					TERMINAL.scannerFatal,
					'[scanner] --clear-token requires --threat-feed-token-name (or THREAT_FEED_TOKEN_NAME)',
				),
			);
			process.exit(1);
		}

		let deleted: boolean;
		try {
			deleted = await Bun.secrets.delete({service, name});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(
				colorize(
					TERMINAL.scannerFatal,
					`[scanner] could not delete token from keychain (${service}/${name}): ${message}`,
				),
			);
			process.exit(1);
		}
		if (deleted) {
			console.error(
				colorize(TERMINAL.scannerOk, `[scanner] token removed from keychain (${service}/${name})`),
			);
		} else {
			console.error(
				colorize(TERMINAL.scannerWarn, `[scanner] no token found for ${service}/${name}`),
			);
		}
		process.exit(0);
	}

	if (cliArgs['list-token'] === true) {
		if (!name) {
			console.error(
				colorize(
					TERMINAL.scannerFatal,
					'[scanner] --list-token requires --threat-feed-token-name (or THREAT_FEED_TOKEN_NAME)',
				),
			);
			process.exit(1);
		}

		// Check existence without printing the value. We call get() and report
		// yes/no; the token itself is never written to stdout/stderr.
		let exists = false;
		try {
			const value = await Bun.secrets.get({service, name});
			exists = value !== null;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(
				colorize(
					TERMINAL.scannerFatal,
					`[scanner] could not query keychain for ${service}/${name}: ${message}`,
				),
			);
			process.exit(1);
		}

		if (exists) {
			console.error(
				colorize(TERMINAL.scannerOk, `[scanner] token present in keychain (${service}/${name})`),
			);
		} else {
			console.error(
				colorize(TERMINAL.scannerWarn, `[scanner] no token found for ${service}/${name}`),
			);
		}
		process.exit(0);
	}
}

// Apply optional console depth before any output, so debug logs from the
// CLI helpers and scanner use the configured inspection depth.
applyConsoleDepth();

// Run the CLI helpers when the flags are present. cliArgs is parsed from
// Bun.argv with strict:false, so --healthcheck / --check-registry / --store-token
// / --clear-token / --list-token are undefined during normal `bun install` or
// library imports — making this a no-op unless the user explicitly passes the
// flags.
await runHealthCheck();
await runRegistryCheck();
await runTokenCli();
