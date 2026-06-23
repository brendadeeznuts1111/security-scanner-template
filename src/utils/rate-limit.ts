export interface RateLimitOptions {
	/** Max attempts allowed in the window. */
	maxAttempts: number;
	/** Window duration in milliseconds. */
	windowMs: number;
	/** Optional backoff multiplier applied after each failed attempt. */
	backoffMultiplier?: number;
}

export interface RateLimiter {
	attempt(): {allowed: boolean; retryAfterMs: number};
	reset(): void;
}

/**
 * Create a simple in-memory sliding-window rate limiter.
 */
export function createRateLimiter(options: RateLimitOptions): RateLimiter {
	const maxAttempts = options.maxAttempts;
	const windowMs = options.windowMs;
	const backoffMultiplier = options.backoffMultiplier ?? 1;
	const attempts: number[] = [];

	return {
		attempt() {
			const now = Date.now();
			const cutoff = now - windowMs;

			while (attempts.length > 0 && attempts[0]! <= cutoff) {
				attempts.shift();
			}

			if (attempts.length < maxAttempts) {
				attempts.push(now);
				return {allowed: true, retryAfterMs: 0};
			}

			const oldest = attempts[0] ?? now;
			const retryAfterMs = Math.max(0, oldest + windowMs - now);
			const backoffMs = Math.round(retryAfterMs * backoffMultiplier);
			return {allowed: false, retryAfterMs: backoffMs};
		},
		reset() {
			attempts.length = 0;
		},
	};
}

import {sleep as bunSleep} from './runtime.ts';

/** Sleep for a number of milliseconds using `Bun.sleep`. */
export function sleep(ms: number | Date): Promise<void> {
	return bunSleep(ms);
}

/**
 * Exponential backoff delay helper.
 */
export function exponentialBackoffMs(baseMs: number, attempt: number, maxMs = 30_000): number {
	return Math.min(baseMs * 2 ** attempt, maxMs);
}
