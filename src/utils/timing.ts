import {nanoseconds} from './runtime.ts';

export interface Timer {
	/** Elapsed time in nanoseconds since the timer started. */
	elapsedNs(): number;
	/** Elapsed time in milliseconds since the timer started. */
	elapsedMs(): number;
}

/**
 * High-resolution timer backed by Bun.nanoseconds().
 */
export function createTimer(): Timer {
	const start = nanoseconds();
	return {
		elapsedNs: () => nanoseconds() - start,
		elapsedMs: () => Math.round((nanoseconds() - start) / 1_000_000),
	};
}