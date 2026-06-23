import {expect, test} from 'bun:test';
import {fetchWithRetry} from '../../src/net/retry.ts';

test('fetchWithRetry backs off with Bun.sleep between failures', async () => {
	const start = Date.now();

	await expect(
		fetchWithRetry('http://127.0.0.1:1', {
			retries: 2,
			retryDelayMs: 25,
			timeoutMs: 50,
		}),
	).rejects.toThrow();

	expect(Date.now() - start).toBeGreaterThanOrEqual(70);
});