/**
 * Core bun:test expect matchers (Jest-compatible subset).
 * @see https://bun.com/reference/bun/test/expect
 */
import {describe, expect, test} from 'bun:test';

describe('identity and equality', () => {
	test('toBe uses referential equality', () => {
		const ref = {id: 1};
		expect(ref).toBe(ref);
		expect(1 + 1).toBe(2);
		expect('a').not.toBe('b');
	});

	test('toEqual deep-compares structures', () => {
		expect({a: [1, {b: 2}]}).toEqual({a: [1, {b: 2}]});
		expect({a: 1}).not.toEqual({a: 2});
	});

	test('toStrictEqual rejects undefined object properties', () => {
		expect({a: 1}).toStrictEqual({a: 1});
		expect({a: 1, b: undefined}).not.toStrictEqual({a: 1});
	});
});

describe('types and presence', () => {
	test('toBeNull, toBeDefined, toBeUndefined', () => {
		expect(null).toBeNull();
		expect(undefined).toBeUndefined();
		expect(0).toBeDefined();
		expect('').toBeDefined();
	});

	test('toBeTruthy and toBeFalsy', () => {
		expect(1).toBeTruthy();
		expect('').toBeFalsy();
		expect(0).toBeFalsy();
	});
});

describe('numbers and strings', () => {
	test('toBeGreaterThan and comparison matchers', () => {
		expect(3).toBeGreaterThan(2);
		expect(3).toBeGreaterThanOrEqual(3);
		expect(2).toBeLessThan(3);
		expect(2).toBeLessThanOrEqual(2);
	});

	test('toBeCloseTo compares floats', () => {
		expect(0.1 + 0.2).toBeCloseTo(0.3, 5);
		expect(10.005).toBeCloseTo(10.01, 2);
	});

	test('toMatch matches strings and regexes', () => {
		expect('hello world').toMatch(/world$/);
		expect('abc').toMatch('b');
		expect('abc').not.toMatch('z');
	});
});

describe('collections', () => {
	test('toHaveLength checks array-like size', () => {
		expect([1, 2, 3]).toHaveLength(3);
		expect('abc').toHaveLength(3);
		expect([]).toHaveLength(0);
	});
});

describe('error matchers', () => {
	test('toThrow matches thrown values', () => {
		const boom = () => {
			throw new Error('boom');
		};
		expect(boom).toThrow('boom');
		expect(boom).toThrow(Error);
		expect(() => {}).not.toThrow();
	});
});

describe('promises', () => {
	test('resolves and rejects matchers', async () => {
		await expect(Promise.resolve(42)).resolves.toBe(42);
		await expect(Promise.reject(new Error('nope'))).rejects.toThrow('nope');
	});
});

describe('assertion counting', () => {
	test.serial('hasAssertions and assertions track expect calls', () => {
		expect.hasAssertions();
		expect.assertions(2);
		expect(1).toBe(1);
		expect(2).toBe(2);
	});
});
