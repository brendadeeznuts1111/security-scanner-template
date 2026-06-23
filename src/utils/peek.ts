/**
 * Promise peek helpers aligned with Bun's utils docs.
 *
 * @see https://bun.com/docs/runtime/utils#bun-peek
 */
export const BUN_PEEK_DOCS_URL = 'https://bun.com/docs/runtime/utils#bun-peek';

export type PeekStatus = 'pending' | 'fulfilled' | 'rejected';

export function isPeekAvailable(): boolean {
	return typeof Bun.peek === 'function';
}

/**
 * Read a settled promise without await; returns the value, error, or the
 * pending promise itself when not yet settled. Non-promises pass through.
 */
export function peekValue<T>(value: T | Promise<T>): T | Promise<T> {
	return Bun.peek(value);
}

/** Read promise settlement status without resolving it. */
export function peekStatus<T>(promise: Promise<T>): PeekStatus {
	return Bun.peek.status(promise);
}