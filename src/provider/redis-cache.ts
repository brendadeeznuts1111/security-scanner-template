import type {CacheEntry, CacheOptions} from './cache.ts';

function cacheKey(url: string, options: Pick<CacheOptions, 'domain'>): string {
	const namespace = options.domain ?? 'default';
	return `bun-scanner:feed:${namespace}:${Bun.hash(url).toString(16)}`;
}

function redisUrl(): string | null {
	return process.env.REDIS_URL ?? process.env.THREAT_FEED_REDIS_URL ?? null;
}

async function ensureRedisConnected(): Promise<boolean> {
	const url = redisUrl();
	if (!url) return false;

	if (!process.env.REDIS_URL) {
		process.env.REDIS_URL = url;
	}

	if (!Bun.redis.connected) {
		try {
			await Bun.redis.connect();
		} catch {
			return false;
		}
	}

	return Bun.redis.connected;
}

/**
 * Read a cached feed entry from Redis when REDIS_URL is configured.
 */
export async function readRedisCacheEntry(
	url: string,
	options: Pick<CacheOptions, 'domain'>,
): Promise<CacheEntry | null> {
	if (!(await ensureRedisConnected())) return null;

	const raw = await Bun.redis.get(cacheKey(url, options));
	if (!raw) return null;

	try {
		return JSON.parse(raw) as CacheEntry;
	} catch {
		return null;
	}
}

/**
 * Write a cached feed entry to Redis with a TTL in seconds.
 */
export async function writeRedisCacheEntry(
	url: string,
	entry: CacheEntry,
	options: CacheOptions,
): Promise<void> {
	if (!(await ensureRedisConnected())) return;

	const ttlSeconds = Math.max(1, Math.ceil(options.ttlMs / 1000));
	const key = cacheKey(url, options);
	const value = JSON.stringify(entry);
	const redis = Bun.redis as typeof Bun.redis & {
		setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
	};
	await redis.setex(key, ttlSeconds, value);
}

/**
 * Delete a Redis cache entry for a feed URL.
 */
export async function clearRedisCache(
	url: string,
	options: Pick<CacheOptions, 'domain'> = {},
): Promise<void> {
	if (!(await ensureRedisConnected())) return;
	await Bun.redis.del(cacheKey(url, options));
}
