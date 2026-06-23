import {sleep} from './rate-limit.ts';

/**
 * Debounce synchronous callbacks with setTimeout (for fs.watch and sync hooks).
 */
export function createDebouncer(fn: () => void, ms: number): () => void {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	return () => {
		clearTimeout(timeout);
		timeout = setTimeout(fn, ms);
	};
}

/**
 * Debounce async work using Bun.sleep. Each trigger resets the wait window.
 */
export function createAsyncDebouncer(fn: () => void | Promise<void>, ms: number): () => void {
	let generation = 0;

	return () => {
		const current = ++generation;
		void (async () => {
			await sleep(ms);
			if (current === generation) {
				await fn();
			}
		})();
	};
}
