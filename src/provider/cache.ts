import path from 'path';
import {mkdir} from 'fs/promises';
import {compressText, decompressText} from '../crypto/compress.ts';
import {FEATURE_CACHE_REDIS} from '../features/index.ts';
import {readRedisCacheEntry, writeRedisCacheEntry} from './redis-cache.ts';

export interface CacheEntry {
	url: string;
	fetchedAt: number;
	data: unknown;
	etag?: string;
}

export interface CachePathOptions {
	domain?: string;
	cachePath?: string;
	redis?: boolean;
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

async function readFileCacheEntry(filePath: string): Promise<CacheEntry | null> {
	const file = Bun.file(filePath);
	if (!(await file.exists())) return null;

	try {
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (bytes.length >= 3 && bytes[0] === 0x42 && bytes[1] === 0x53 && bytes[2] === 0x43) {
			return JSON.parse(decompressText(bytes)) as CacheEntry;
		}

		return JSON.parse(new TextDecoder().decode(bytes)) as CacheEntry;
	} catch {
		return null;
	}
}

async function writeFileCacheEntry(filePath: string, entry: CacheEntry): Promise<void> {
	await ensureDir(filePath);
	try {
		const compressed = compressText(JSON.stringify(entry), 'zstd');
		await Bun.write(filePath, compressed);
	} catch {
		// Ignore cache write failures.
	}
}

async function readCacheEntry(url: string, options: CachePathOptions): Promise<CacheEntry | null> {
	if (FEATURE_CACHE_REDIS && options.redis !== false) {
		const redisEntry = await readRedisCacheEntry(url, options);
		if (redisEntry) return redisEntry;
	}

	return readFileCacheEntry(cachePathForUrl(url, options));
}

async function writeCacheEntry(
	url: string,
	entry: CacheEntry,
	options: CacheOptions,
): Promise<void> {
	if (FEATURE_CACHE_REDIS && options.redis !== false) {
		await writeRedisCacheEntry(url, entry, options);
	}

	await writeFileCacheEntry(cachePathForUrl(url, options), entry);
}

async function revalidateAsync(
	url: string,
	options: CacheOptions,
	fetcher: () => Promise<Response>,
	etag?: string,
): Promise<void> {
	const filePath = cachePathForUrl(url, options);
	try {
		const response = await fetcher();
		if (response.status === 304) return;

		const data = await response.json();
		await writeCacheEntry(
			url,
			{
				url,
				fetchedAt: Date.now(),
				data,
				etag: response.headers.get('etag') ?? undefined,
			},
			options,
		);
	} catch {
		void filePath;
	}
}

async function fetchWithConditionalGet(
	fetcher: () => Promise<Response>,
	etag?: string,
): Promise<Response> {
	if (!etag) return fetcher();
	return fetcher();
}

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

	const entry = await readCacheEntry(url, options);
	const now = Date.now();
	const stale = !entry || now - entry.fetchedAt > ttlMs;

	if (!stale && entry) {
		revalidateAsync(url, options, () => fetchWithConditionalGet(fetcher, entry.etag), entry.etag);
		return entry.data;
	}

	const response = await fetchWithConditionalGet(fetcher, entry?.etag);
	const data = await response.json();
	await writeCacheEntry(
		url,
		{
			url,
			fetchedAt: now,
			data,
			etag: response.headers.get('etag') ?? undefined,
		},
		options,
	);
	return data;
}

export async function clearCache(url: string, options: CachePathOptions = {}): Promise<void> {
	const filePath = cachePathForUrl(url, options);
	const file = Bun.file(filePath);
	if (await file.exists()) {
		await file.delete().catch(() => {});
	}

	if (FEATURE_CACHE_REDIS && options.redis !== false) {
		const {clearRedisCache} = await import('./redis-cache.ts');
		await clearRedisCache(url, options);
	}
}
