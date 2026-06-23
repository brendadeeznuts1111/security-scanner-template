/**
 * Deep equality helpers aligned with Bun's deep-equals guide.
 *
 * @see https://bun.com/docs/guides/util/deep-equals
 * @see https://bun.com/docs/runtime/utils#bun-deepequals
 */
export const BUN_DEEP_EQUALS_GUIDE_URL = 'https://bun.com/docs/guides/util/deep-equals';
export const BUN_DEEP_EQUALS_DOCS_URL = 'https://bun.com/docs/runtime/utils#bun-deepequals';

export function isDeepEqualAvailable(): boolean {
	return typeof Bun.deepEquals === 'function';
}

/**
 * Deep structural equality (`expect().toEqual()` semantics in bun:test).
 */
export function deepEquals(a: unknown, b: unknown, strict = false): boolean {
	return Bun.deepEquals(a, b, strict);
}

/**
 * Strict deep equality (`expect().toStrictEqual()` semantics in bun:test).
 */
export function deepEqualsStrict(a: unknown, b: unknown): boolean {
	return Bun.deepEquals(a, b, true);
}