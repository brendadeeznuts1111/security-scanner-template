/**
 * Bun expect object matchers (Jest-compatible subset).
 * @see https://bun.com/docs/test/writing-tests#object-matchers
 */
import {describe, expect, test} from 'bun:test';

const sample = {a: 'hello', b: 'world'};
const numbered = {1: 'hello', b: 'world'};
const values = {a: 'foo', b: 'bar', c: 'baz'};
const nested = {message: {hello: 'world'}};
const nestedArray = {message: [{hello: 'world'}]};
const mixed = {a: 'foo', b: [1, 'hello', true], c: 'baz'};

describe('toContainKey / toContainKeys', () => {
	test('matches single and multiple keys', () => {
		expect(values).toContainKey('a');
		expect(values).toContainKey('b');
		expect(values).not.toContainKey('d');
		expect(values).toContainKeys(['a', 'b']);
		expect(values).toContainKeys(['a', 'b', 'c']);
		expect(values).not.toContainKeys(['a', 'b', 'e']);
	});
});

describe('toContainAllKeys / toContainAnyKeys', () => {
	test('toContainAllKeys requires exact key set (order-independent)', () => {
		expect(sample).toContainAllKeys(['a', 'b']);
		expect(sample).toContainAllKeys(['b', 'a']);
		expect(numbered).toContainAllKeys(['1', 'b']);
		expect(sample).not.toContainAllKeys(['c']);
		// ['a'] alone is not the full key set when the object also has 'b'
		expect(sample).not.toContainAllKeys(['a']);
	});

	test('toContainKeys matches required key subsets', () => {
		expect({...sample, extra: true}).toContainKeys(['a', 'b']);
		expect(numbered).toContainKeys(['1', 'b']);
	});

	test('toContainAnyKeys matches subsets', () => {
		expect({a: 'hello', b: 'world'}).toContainAnyKeys(['a']);
		// Expected keys may include absent entries — matcher passes when any one is present.
		const loose = {a: 'hello', b: 'world'} as Record<PropertyKey, unknown>;
		expect(loose).toContainAnyKeys(['b', 'c']);
		expect(loose).not.toContainAnyKeys(['c']);
	});
});

describe('toContainValue / toContainValues', () => {
	test('finds shallow, nested, and array values', () => {
		expect({hello: 'world'}).toContainValue('world');
		expect({foo: false}).toContainValue(false);
		expect(nested).toContainValue({hello: 'world'});
		expect(nestedArray).toContainValue([{hello: 'world'}]);
		expect(mixed).toContainValue('foo');
		expect(mixed).toContainValue([1, 'hello', true]);
		expect(mixed).not.toContainValue('qux');
	});

	test('toContainValues accepts value lists', () => {
		expect(values).toContainValues(['foo']);
		expect(values).toContainValues(['baz', 'bar']);
		expect(values).not.toContainValues(['qux', 'foo']);
	});
});

describe('toContainAllValues / toContainAnyValues', () => {
	test('matches full or partial value sets', () => {
		expect(values).toContainAllValues(['foo', 'bar', 'baz']);
		expect(values).toContainAllValues(['baz', 'bar', 'foo']);
		expect(values).not.toContainAllValues(['bar', 'foo']);
		expect(values).toContainAnyValues(['qux', 'foo']);
		expect(values).toContainAnyValues(['qux', 'bar']);
		expect(values).not.toContainAnyValues(['qux']);
	});
});

describe('toContainEqual', () => {
	test('deep-equals array members', () => {
		expect([{a: 1}]).toContainEqual({a: 1});
		expect([{a: 1}]).not.toContainEqual({a: 2});
	});
});