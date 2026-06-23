import type {FeedFetchProtocol} from '../config/types.ts';
import {sleep} from '../utils/rate-limit.ts';

export interface RetryOptions {
	timeoutMs?: number;
	retries?: number;
	retryDelayMs?: number;
	headers?: Record<string, string>;
	/** Experimental Bun fetch protocol (HTTP/2 or HTTP/3). */
	protocol?: FeedFetchProtocol;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

/**
 * Fetch a URL with timeout, retry, and Bun.sleep backoff between attempts.
 */
export async function fetchWithRetry(url: string, options: RetryOptions = {}): Promise<Response> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const retries = options.retries ?? DEFAULT_RETRIES;
	const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
	const headers = options.headers ?? {};

	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= retries; attempt++) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const init = {
				signal: controller.signal,
				headers,
				...(options.protocol ? {protocol: options.protocol} : {}),
			} as BunFetchRequestInit;
			const response = await fetch(url, init);
			clearTimeout(timeoutId);
			return response;
		} catch (error) {
			clearTimeout(timeoutId);
			lastError = error instanceof Error ? error : new Error(String(error));
			if (attempt < retries) {
				await sleep(retryDelayMs * (attempt + 1));
			}
		}
	}

	throw lastError;
}
