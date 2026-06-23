import {getCachedFeed, type CacheOptions} from './cache.ts';
import {isJSONLSource, parseJSONLFeed, streamJSONLFeed} from './feed-jsonl.ts';
import {normalizeThreatFeed, type AllowlistItem, type ThreatFeedItem} from './validator.ts';

export interface FeedConfig {
	/** Local path to a JSON file containing the threat feed and allowlist. */
	local?: string;
	/** Remote URL to fetch the threat feed from. */
	remote?: string;
	/** Vault key name for the API key used to authenticate with the remote feed. */
	apiKeyVault?: string;
	/** Service name for the API key vault. */
	apiKeyService?: string;
	/** Local path to cache the downloaded feed. */
	cachePath?: string;
	cacheTtl?: number;
}

export interface LoadedFeed {
	/** Normalized threat feed items. */
	rules: ThreatFeedItem[];
	/** Normalized allowlist items. */
	allowlist: AllowlistItem[];
}

const DEFAULT_API_KEY_SERVICE = 'com.factory-wager.bun-security-planner';
const DEFAULT_CACHE_TTL_SECONDS = 3600; // 1 hour

/**
 * Get the cache TTL in seconds.
 * If a cache TTL is provided in the config, it will be used.
 * Otherwise, the default cache TTL will be used.
 */
export function getCacheTtlSeconds(config: FeedConfig): number {
	if (config.cacheTtl === undefined) return DEFAULT_CACHE_TTL_SECONDS;
	return Number.isFinite(config.cacheTtl) && config.cacheTtl >= 0 ? config.cacheTtl : 0;
}

/**
 * Read the API key from the secret store.
 * If no API key vault is configured, return null.
 * If the secret store is not available, return null.
 */
async function readApiKey(config: FeedConfig): Promise<string | null> {
	if (!config.apiKeyVault) return null;
	if (typeof Bun.secrets === 'undefined') return null;

	try {
		return await Bun.secrets.get({
			service: config.apiKeyService ?? DEFAULT_API_KEY_SERVICE,
			name: config.apiKeyVault,
		});
	} catch {
		return null;
	}
}

/**
 * Fetch a URL with a timeout and retry logic.
 * If the request fails, it will be retried up to the specified number of times.
 * If all retries fail, the last error will be thrown.
 */
async function fetchWithTimeoutAndRetry(
	url: string,
	timeoutMs = 5000,
	retries = 2,
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
				await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
			}
		}
	}

	throw lastError;
}

function buildRemoteFeedFetcher(config: FeedConfig): () => Promise<Response> {
	return async () => {
		const headers: Record<string, string> = {};
		const apiKey = await readApiKey(config);
		if (apiKey) {
			headers['Authorization'] = `Bearer ${apiKey}`;
		}

		return fetchWithTimeoutAndRetry(config.remote!, 5000, 2, headers);
	};
}

/**
 * Load the remote feed from the configured URL.
 * Uses stale-while-revalidate caching when cacheTtl > 0.
 * JSONL feeds are streamed and processed line-by-line.
 */
async function loadRemoteFeed(config: FeedConfig): Promise<LoadedFeed> {
	if (!config.remote) {
		throw new Error('No remote feed URL configured');
	}

	if (isJSONLSource(config.remote)) {
		const response = await buildRemoteFeedFetcher(config)();
		return streamJSONLFeed(response);
	}

	const ttlSeconds = getCacheTtlSeconds(config);
	const cacheOptions: CacheOptions = {
		ttlMs: ttlSeconds * 1000,
		cachePath: config.cachePath,
	};

	const data = await getCachedFeed(config.remote, cacheOptions, buildRemoteFeedFetcher(config));
	return normalizeThreatFeed(data);
}

/**
 * Load the local feed from the configured local path.
 * If a local feed path is not configured, throw an error.
 * Supports both plain JSON and JSONL formats.
 */
async function loadLocalFeed(localPath: string): Promise<LoadedFeed> {
	const file = Bun.file(localPath);
	const text = await file.text();

	if (isJSONLSource(localPath)) {
		return parseJSONLFeed(text);
	}

	return normalizeThreatFeed(JSON.parse(text));
}

const DEFAULT_RULES_PATH = new URL('../../rules/security-rules.json', import.meta.url).pathname;

async function loadDefaultRules(): Promise<LoadedFeed> {
	const file = Bun.file(DEFAULT_RULES_PATH);
	if (!(await file.exists())) {
		return {rules: [], allowlist: []};
	}
	const data = await file.json();
	return normalizeThreatFeed(data);
}

/**
 * Load the threat feed for a provider configuration.
 *
 * Precedence: local path → remote URL → bundled default rules.
 */
export async function loadFeed(config: FeedConfig): Promise<LoadedFeed> {
	if (config.local) {
		return loadLocalFeed(config.local);
	}

	if (config.remote) {
		return loadRemoteFeed(config);
	}

	return loadDefaultRules();
}

/**
 * Synchronously peek at the bundled default rules path.
 */
export function getDefaultRulesPath(): string {
	return DEFAULT_RULES_PATH;
}
