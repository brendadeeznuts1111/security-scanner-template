/**
 * High-resolution timers aligned with Bun's nanoseconds guide.
 *
 * @see https://bun.com/docs/guides/process/nanoseconds
 * @see https://bun.com/docs/runtime/utils#bun-nanoseconds
 */
export const BUN_NANOSECONDS_GUIDE_URL = 'https://bun.com/docs/guides/process/nanoseconds';
export const BUN_NANOSECONDS_DOCS_URL = 'https://bun.com/docs/runtime/utils#bun-nanoseconds';

export function isNanosecondsAvailable(): boolean {
	return typeof Bun.nanoseconds === 'function';
}

/** Monotonic nanoseconds since the Bun process started. */
export function nanoseconds(): number {
	return Bun.nanoseconds();
}