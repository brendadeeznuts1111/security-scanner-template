import type {FeedFetchProtocol} from '../config/types.ts';
import {FEATURE_FEED_WEBSOCKET, FEATURE_INTEL_DNS} from '../features/index.ts';
import {getCachedFeed, type CacheFetcher, type CacheOptions} from './cache.ts';
import {loadWebSocketFeed} from './feed-websocket.ts';
import {isJSONLSource, parseJSONLFeed, streamJSONLFeed} from './feed-jsonl.ts';
import {resolveFeedProtocol} from '../net/protocol.ts';
import {fetchWithRetry} from '../net/retry.ts';
import {scanHtmlResponse} from '../scan/html.ts';
import {inspectFeedUrl, type DnsThreatConfig} from '../threat-intel/dns.ts';
import {normalizeThreatFeed, type AllowlistItem, type ThreatFeedItem} from './validator.ts';
import {createRateLimiter} from '../utils/rate-limit.ts';
import {filePathFromModuleUrl} from '../utils/runtime.ts';

export interface FeedConfig {
	local?: string;
	remote?: string;
	apiKeyVault?: string;
	apiKeyService?: string;
	cachePath?: string;
	cacheTtl?: number;
	protocol?: FeedFetchProtocol;
	dnsThreat?: DnsThreatConfig;
	scanHtml?: boolean;
}

export interface LoadedFeed {
	rules: ThreatFeedItem[];
	allowlist: AllowlistItem[];
}

/** Legacy fallback when feed config is built without a domain context. */
const LEGACY_API_KEY_SERVICE = 'com.factory-wager.bun-security-planner';
const DEFAULT_CACHE_TTL_SECONDS = 3600;

const FEED_RATE_LIMITER = createRateLimiter({
	maxAttempts: 60,
	windowMs: 60_000,
});

function isWebSocketUrl(url: string): boolean {
	return url.startsWith('ws://') || url.startsWith('wss://');
}

export function getCacheTtlSeconds(config: FeedConfig): number {
	if (config.cacheTtl === undefined) return DEFAULT_CACHE_TTL_SECONDS;
	return Number.isFinite(config.cacheTtl) && config.cacheTtl >= 0 ? config.cacheTtl : 0;
}

async function readApiKey(config: FeedConfig): Promise<string | null> {
	if (!config.apiKeyVault) return null;
	if (typeof Bun.secrets === 'undefined') return null;

	try {
		return await Bun.secrets.get({
			service: config.apiKeyService ?? LEGACY_API_KEY_SERVICE,
			name: config.apiKeyVault,
		});
	} catch {
		return null;
	}
}

async function buildAuthHeaders(config: FeedConfig): Promise<Record<string, string>> {
	const headers: Record<string, string> = {};
	const apiKey = await readApiKey(config);
	if (apiKey) {
		headers['Authorization'] = `Bearer ${apiKey}`;
	}
	return headers;
}

function buildRemoteFeedFetcher(config: FeedConfig): CacheFetcher {
	return async init => {
		const limit = FEED_RATE_LIMITER.attempt();
		if (!limit.allowed) {
			throw new Error(`Threat feed rate limit exceeded; retry after ${limit.retryAfterMs}ms`);
		}
		const headers = await buildAuthHeaders(config);
		if (init?.ifNoneMatch) {
			headers['If-None-Match'] = init.ifNoneMatch;
		}
		const protocol = resolveFeedProtocol(config.protocol);
		return fetchWithRetry(config.remote!, {headers, protocol});
	};
}

async function parseRemoteResponse(
	response: Response,
	url: string,
	config: FeedConfig,
): Promise<LoadedFeed> {
	const contentType = response.headers.get('content-type') ?? '';

	if (config.scanHtml || contentType.includes('text/html')) {
		const html = await response.text();
		const findings = await scanHtmlResponse(html);
		if (findings.some(finding => finding.severity === 'fatal')) {
			const summary = findings.map(finding => finding.description).join('; ');
			throw new Error(`HTML threat feed blocked for ${url}: ${summary}`);
		}

		try {
			return normalizeThreatFeed(JSON.parse(html));
		} catch {
			throw new Error(`HTML response from ${url} is not a valid threat feed document`);
		}
	}

	if (isJSONLSource(url)) {
		return streamJSONLFeed(response);
	}

	return normalizeThreatFeed(await response.json());
}

async function loadRemoteFeed(config: FeedConfig): Promise<LoadedFeed> {
	if (!config.remote) {
		throw new Error('No remote feed URL configured');
	}

	if (FEATURE_INTEL_DNS && config.dnsThreat && !isWebSocketUrl(config.remote)) {
		const inspection = await inspectFeedUrl(config.remote, config.dnsThreat);
		if (inspection?.suspicious) {
			throw new Error(
				`Remote feed DNS check failed for ${inspection.hostname}: ${inspection.reason}`,
			);
		}
	}

	if (isWebSocketUrl(config.remote)) {
		if (!FEATURE_FEED_WEBSOCKET) {
			throw new Error(
				'WebSocket threat feeds are not included in this build (FEATURE_FEED_WEBSOCKET=false)',
			);
		}
		return loadWebSocketFeed(config.remote);
	}

	if (isJSONLSource(config.remote)) {
		const response = await buildRemoteFeedFetcher(config)();
		return parseRemoteResponse(response, config.remote, config);
	}

	const ttlSeconds = getCacheTtlSeconds(config);
	const cacheOptions: CacheOptions = {
		ttlMs: ttlSeconds * 1000,
		cachePath: config.cachePath,
	};

	if (ttlSeconds <= 0) {
		const response = await buildRemoteFeedFetcher(config)();
		return parseRemoteResponse(response, config.remote, config);
	}

	const data = await getCachedFeed(config.remote, cacheOptions, buildRemoteFeedFetcher(config));
	return normalizeThreatFeed(data);
}

async function loadLocalFeed(localPath: string): Promise<LoadedFeed> {
	const file = Bun.file(localPath);
	const text = await file.text();

	if (isJSONLSource(localPath)) {
		return parseJSONLFeed(text);
	}

	return normalizeThreatFeed(JSON.parse(text));
}

const DEFAULT_RULES_PATH = filePathFromModuleUrl(
	new URL('../../rules/security-rules.json', import.meta.url),
);

async function loadDefaultRules(): Promise<LoadedFeed> {
	const file = Bun.file(DEFAULT_RULES_PATH);
	if (!(await file.exists())) {
		return {rules: [], allowlist: []};
	}

	const text = await file.text();
	return normalizeThreatFeed(JSON.parse(text));
}

export async function loadThreatFeed(config: FeedConfig = {}): Promise<LoadedFeed> {
	if (config.local) {
		return loadLocalFeed(config.local);
	}

	if (config.remote) {
		return loadRemoteFeed(config);
	}

	return loadDefaultRules();
}
