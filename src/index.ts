import {z} from 'zod';
import {parseArgs} from 'util';

const ThreatCategorySchema = z.enum([
	'protestware',
	'adware',
	'backdoor',
	'malware',
	'botnet',
	'deprecated',
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

const DEFAULT_RULES_PATH = new URL('../rules/security-rules.json', import.meta.url).pathname;

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
		'scanner-log-path': {type: 'string'},
		'scanner-log-stderr': {type: 'boolean'},
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

// --- Colorized stderr output via Bun.color (auto-detects terminal support) ---
// Bun.color(input, "ansi") returns "" when stdout has no color support, so
// piping to a file produces plain text with zero overhead.

const ANSI_RESET = '\x1b[0m';

function color(hex: string): string {
	// Bun.color returns null on parse failure; coerce to "" for safety.
	return Bun.color(hex, 'ansi') ?? '';
}

function colorize(hex: string, text: string): string {
	const code = color(hex);
	return code ? `${code}${text}${ANSI_RESET}` : text;
}

const COLOR_FATAL = '#ff4444'; // red
const COLOR_WARN = '#ffcc33'; // amber
const COLOR_ALLOWED = '#33dd66'; // green
const COLOR_INFO = '#33aaff'; // cyan
const COLOR_DIM = '#888888'; // gray
const COLOR_ERROR = '#ff4444'; // red

function formatEventForStderr(event: ScannerEvent): string {
	switch (event.type) {
		case 'scan.start':
			return colorize(COLOR_INFO, `[scanner] scan started: ${event.packageCount} package(s)`);
		case 'feed.loaded':
			return colorize(
				COLOR_DIM,
				`[scanner] feed loaded (${event.source}): ${event.ruleCount} rule(s), ${event.allowlistCount} allowlist entr${event.allowlistCount === 1 ? 'y' : 'ies'}`,
			);
		case 'threat.detected': {
			const c = event.level === 'fatal' ? COLOR_FATAL : COLOR_WARN;
			const label = event.level.toUpperCase();
			const pkg = event.version ? `${event.package}@${event.version}` : event.package;
			const cats = event.categories.join(', ');
			const hash = event.hashVerified ? ' [hash verified]' : '';
			return colorize(c, `[scanner] ${label} ${pkg} — ${cats}${hash}`);
		}
		case 'threat.allowed': {
			const pkg = event.version ? `${event.package}@${event.version}` : event.package;
			const reason = event.reason ? ` — ${event.reason}` : '';
			return colorize(COLOR_ALLOWED, `[scanner] ALLOWED ${pkg}${reason}`);
		}
		case 'scan.complete':
			return colorize(
				COLOR_INFO,
				`[scanner] scan complete: ${event.advisoryCount} advisory(ies), ${event.allowedCount} allowed (${event.durationMs}ms)`,
			);
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
			source: 'remote' | 'local' | 'stdin' | 'default';
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
			console.error(colorize(COLOR_ERROR, `[scanner] failed to write event log: ${error}`));
		}
	}
}

async function fetchWithTimeoutAndRetry(
	url: string,
	timeoutMs = getFetchTimeoutMs(),
	retries = getFetchRetries(),
): Promise<Response> {
	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= retries; attempt++) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(url, {signal: controller.signal});
			clearTimeout(timeoutId);
			return response;
		} catch (error) {
			clearTimeout(timeoutId);
			lastError = error instanceof Error ? error : new Error(String(error));
			if (attempt < retries) {
				await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
			}
		}
	}

	throw lastError;
}

async function fetchRemoteThreatFeed(
	url: string,
): Promise<{rules: ThreatFeedItem[]; allowlist: AllowlistItem[]}> {
	const response = await fetchWithTimeoutAndRetry(url);

	if (!response.ok) {
		throw new Error(`Threat feed request failed: ${response.status} ${response.statusText}`);
	}

	const data = await response.json();
	const feed = normalizeThreatFeed(data);

	await emitEvent({
		type: 'feed.loaded',
		source: 'remote',
		ruleCount: feed.rules.length,
		allowlistCount: feed.allowlist.length,
		timestamp: new Date().toISOString(),
	});

	return feed;
}

async function loadLocalThreatFeed(
	path: string,
): Promise<{rules: ThreatFeedItem[]; allowlist: AllowlistItem[]}> {
	const file = Bun.file(path);
	const data = await file.json();
	const feed = normalizeThreatFeed(data);

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
 * Read a threat feed from stdin. Bun.stdin is a BunFile, so we can read it
 * as JSON directly. Only called when --threat-feed-stdin / THREAT_FEED_STDIN
 * is explicitly set, so this won't interfere with `bun install` piping.
 */
async function loadStdinThreatFeed(): Promise<{
	rules: ThreatFeedItem[];
	allowlist: AllowlistItem[];
}> {
	const data = await Bun.stdin.json();
	const feed = normalizeThreatFeed(data);

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
				COLOR_ERROR,
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
		if (entry.package === pkg.name && Bun.semver.satisfies(pkg.version, entry.range)) {
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
				Bun.semver.satisfies(p.version, item.range) &&
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
		'tarball-hash-verification',
		'timeout-and-retry',
		'zod-validation',
		'allowlist-policy',
		'structured-event-emission',
	],
	categories: ['protestware', 'adware', 'backdoor', 'malware', 'botnet', 'deprecated'],
};

export const scanner: Bun.Security.Scanner = {
	version: '1',
	async scan({packages}) {
		const start = performance.now();
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

		const threats = await findThreatsWithHashes(packages, rules, allowlist);
		const results: Bun.Security.Advisory[] = [];

		for (const {item, matchingPackages, hashVerified} of threats) {
			const level = categorize(item);
			if (!level) continue;

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
			durationMs: Math.round(performance.now() - start),
			timestamp: new Date().toISOString(),
		});

		closeEventLogWriter();

		return results;
	},
};
