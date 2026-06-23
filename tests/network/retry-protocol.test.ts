import {expect, test, afterEach} from 'bun:test';
import {fetchWithRetry} from '../../src/net/retry.ts';

let originalFetch: typeof fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

test('fetchWithRetry forwards protocol to fetch init', async () => {
	originalFetch = globalThis.fetch;
	const seen: BunFetchRequestInit[] = [];

	globalThis.fetch = (async (_url, init) => {
		seen.push((init ?? {}) as BunFetchRequestInit);
		return new Response('{}', {status: 200});
	}) as typeof fetch;

	await fetchWithRetry('https://example.com/feed.json', {
		retries: 0,
		timeoutMs: 1000,
		protocol: 'http3',
	});

	expect(seen[0]?.protocol as string | undefined).toBe('http3');
});
