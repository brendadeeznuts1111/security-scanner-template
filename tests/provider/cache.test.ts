import {expect, test, beforeEach, afterEach} from 'bun:test';
import {getCachedFeed, clearCache, type CacheOptions} from '../../src/provider/cache.ts';

const TEST_URL = 'http://localhost:9999/feed.json';

let currentCachePath: string;

async function resetCachePath(): Promise<void> {
	currentCachePath = `/tmp/bun-security-planner-cache-test-${crypto.randomUUID()}.json`;
}

beforeEach(async () => {
	await resetCachePath();
	await clearCache(TEST_URL, {cachePath: currentCachePath});
});

afterEach(async () => {
	await clearCache(TEST_URL, {cachePath: currentCachePath});
});

function feedResponse(data: unknown): Response {
	return new Response(JSON.stringify(data), {
		headers: {'Content-Type': 'application/json', 'etag': '"abc123"'},
	});
}

test('bypasses cache when ttlMs is 0', async () => {
	let calls = 0;
	const fetcher = async () => {
		calls++;
		return feedResponse({rules: []});
	};

	await getCachedFeed(TEST_URL, {ttlMs: 0, cachePath: currentCachePath}, fetcher);
	await getCachedFeed(TEST_URL, {ttlMs: 0, cachePath: currentCachePath}, fetcher);
	expect(calls).toBe(2);
});

test('uses cached data within TTL', async () => {
	let generation = 0;
	const fetcher = async () => {
		generation++;
		return feedResponse({generation});
	};

	const first = await getCachedFeed(
		TEST_URL,
		{ttlMs: 60_000, cachePath: currentCachePath},
		fetcher,
	);
	const second = await getCachedFeed(
		TEST_URL,
		{ttlMs: 60_000, cachePath: currentCachePath},
		fetcher,
	);

	expect(first).toEqual({generation: 1});
	expect(second).toEqual({generation: 1});
});

test('refetches when TTL is expired', async () => {
	let calls = 0;
	const fetcher = async () => {
		calls++;
		return feedResponse({rules: []});
	};

	await getCachedFeed(TEST_URL, {ttlMs: 60_000, cachePath: currentCachePath}, fetcher);

	// Manually age the cache beyond TTL.
	const file = Bun.file(currentCachePath);
	const {decompressText} = await import('../../src/crypto/compress.ts');
	const bytes = new Uint8Array(await file.arrayBuffer());
	const entry = JSON.parse(decompressText(bytes)) as {fetchedAt: number};
	entry.fetchedAt = Date.now() - 120_000;
	const {compressText} = await import('../../src/crypto/compress.ts');
	await Bun.write(currentCachePath, compressText(JSON.stringify(entry), 'zstd'));

	await getCachedFeed(TEST_URL, {ttlMs: 60_000, cachePath: currentCachePath}, fetcher);
	expect(calls).toBe(2);
});

test('isolates caches by domain', async () => {
	let callsA = 0;
	let callsB = 0;

	const fetcherA = async () => {
		callsA++;
		return feedResponse({rules: [{package: 'a', range: '1.0.0', categories: ['malware']}]});
	};
	const fetcherB = async () => {
		callsB++;
		return feedResponse({rules: []});
	};

	const optsA: CacheOptions = {ttlMs: 60_000, cachePath: currentCachePath, domain: 'ledger'};
	const optsB: CacheOptions = {ttlMs: 60_000, cachePath: currentCachePath, domain: 'peptide'};

	await getCachedFeed(TEST_URL, optsA, fetcherA);
	await getCachedFeed(TEST_URL, optsB, fetcherB);
	expect(callsA).toBe(1);
	expect(callsB).toBe(1);
});
