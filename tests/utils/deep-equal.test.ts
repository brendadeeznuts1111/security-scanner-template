/**
 * @see https://bun.com/docs/guides/util/deep-equals
 */
import {expect, test} from 'bun:test';
import {
	BUN_DEEP_EQUALS_DOCS_URL,
	BUN_DEEP_EQUALS_GUIDE_URL,
	deepEquals,
	deepEqualsStrict,
	isDeepEqualAvailable,
} from '../../src/utils/deep-equal.ts';

test('nested objects are deeply equal per bun deep-equals guide', () => {
	const a = {a: 1, b: 2, c: {d: 3}};
	const b = {a: 1, b: 2, c: {d: 3}};
	expect(deepEquals(a, b)).toBe(true);
	expect(deepEqualsStrict(a, b)).toBe(true);
});

test('strict mode rejects undefined object keys', () => {
	expect(deepEquals({}, {a: undefined})).toBe(true);
	expect(deepEqualsStrict({}, {a: undefined})).toBe(false);
});

test('strict mode rejects trailing undefined array elements', () => {
	expect(deepEquals(['asdf'], ['asdf', undefined])).toBe(true);
	expect(deepEqualsStrict(['asdf'], ['asdf', undefined])).toBe(false);
});

test('strict mode distinguishes sparse arrays from explicit undefined', () => {
	expect(deepEquals([, 1], [undefined, 1])).toBe(true);
	expect(deepEqualsStrict([, 1], [undefined, 1])).toBe(false);
});

test('strict mode rejects class instances vs plain objects', () => {
	class Foo {
		a = 1;
	}
	expect(deepEquals(new Foo(), {a: 1})).toBe(true);
	expect(deepEqualsStrict(new Foo(), {a: 1})).toBe(false);
});

test('isDeepEqualAvailable reflects bun deepEquals presence', () => {
	expect(isDeepEqualAvailable()).toBe(typeof Bun.deepEquals === 'function');
});

test('non-strict mode ignores extra undefined object keys per utils docs', () => {
	const a = {entries: [1, 2]};
	const b = {entries: [1, 2], extra: undefined};
	expect(deepEquals(a, b)).toBe(true);
	expect(deepEqualsStrict(a, b)).toBe(false);
});

test('docs URLs point at guide and runtime reference', () => {
	expect(BUN_DEEP_EQUALS_GUIDE_URL).toBe('https://bun.com/docs/guides/util/deep-equals');
	expect(BUN_DEEP_EQUALS_DOCS_URL).toContain('bun-deepequals');
});