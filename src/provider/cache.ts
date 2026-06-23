import path from 'path';
import {mkdir} from 'fs/promises';

export interface CacheEntry {
	url: string;
	fetchedAt: number;
	data: unknown;
	etag?: string;
}

export interface CachePathOptions {
	domain?: string;
	cachePath?: string;
}

export interface CacheOptions extends CachePathOptions {
	ttlMs: number;
}

function defaultCacheDir(): string {
	const xdg = process.env.XDG_CACHE_HOME;
	if (xdg) return path.join(xdg, 'bun-security-planner');
	const home = process.env.HOME;
	if (home) return path.join(home, '.cache', 'bun-security-planner');
	return path.join(process.cwd(), '.security', 'cache');
}

function cachePathForUrl(url: string, options: CachePathOptions): string {
	if (options.cachePath) return path.resolve(options.cachePath);

	const dir = defaultCacheDir();
	const namespace = options.domain ?? 'default';
	const hash = Bun.hash(`${namespace}:${url}`).toString(16);
	return path.join(dir, `${hash}.json`);
}

async function ensureDir(filePath: string): Promise<void> {
	const dir = path.dirname(filePath);
	try {
		await mkdir(dir, {recursive: true});
	} catch {
		// Ignore directory creation failures.
	}
}

async function readCacheEntry(filePath: string): Promise<CacheEntry | null> {
	const file = Bun.file(filePath);
	if (!(await file.exists())) return null;

	try {
		return (await file.json()) as CacheEntry;
	} catch {
		return null;
	}
}

async function writeCacheEntry(filePath: string, entry: CacheEntry): Promise<void> {
	await ensureDir(filePath);
	try {
		await Bun.write(filePath, JSON.stringify(entry));
	} catch {
		// Ignore cache write failures.
	}
}

async function revalidateAsync(
	url: string,
	filePath: string,
	fetcher: () => Promise<Response>,
	etag?: string,
): Promise<void> {
	try {
		const response = await fetcher();
		if (response.status === 304) return;

		const data = await response.json();
		await writeCacheEntry(filePath, {
			url,
			fetchedAt: Date.now(),
			data,
			etag: response.headers.get('etag') ?? undefined,
		});
	} catch {
		// Silent fail: stale cache is acceptable.
	}
}

async function fetchWithConditionalGet(
	fetcher: () => Promise<Response>,
	etag?: string,
): Promise<Response> {
	if (!etag) return fetcher();

	return fetcher();
}

/**
 * Fetch a remote feed with stale-while-revalidate caching.
 *
 * - `ttlMs <= 0`: bypass cache entirely.
 * - Cache hit within TTL: return cached data and refresh in the background.
 * - Cache miss or expired: blocking fetch, then write to cache.
 */
export async function getCachedFeed(
	url: string,
	options: CacheOptions,
	fetcher: () => Promise<Response>,
): Promise<unknown> {
	const ttlMs = options.ttlMs;
	if (ttlMs <= 0) {
		const response = await fetcher();
		return response.json();
	}

	const filePath = cachePathForUrl(url, options);
	const entry = await readCacheEntry(filePath);
	const now = Date.now();
	const stale = !entry || now - entry.fetchedAt > ttlMs;

	if (!stale && entry) {
		revalidateAsync(url, filePath, () => fetchWithConditionalGet(fetcher, entry.etag), entry.etag);
		return entry.data;
	}

	const response = await fetchWithConditionalGet(fetcher, entry?.etag);
	const data = await response.json();
	await writeCacheEntry(filePath, {
		url,
		fetchedAt: now,
		data,
		etag: response.headers.get('etag') ?? undefined,
	});
	return data;
}

/**
 * Clear the cache for a given URL and domain.
 */
export async function clearCache(url: string, options: CachePathOptions = {}): Promise<void> {
	const filePath = cachePathForUrl(url, options);
	const file = Bun.file(filePath);
	if (await file.exists()) {
		await file.delete().catch(() => {});
	}
}
