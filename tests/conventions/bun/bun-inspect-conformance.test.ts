/**
 * @see https://bun.com/docs/runtime/utils#bun-inspect
 */
import {expect, test} from 'bun:test';
import {
	BUN_INSPECT_DOCS_URL,
	formatTable,
	formatValue,
	isInspectAvailable,
} from '../../../src/utils/inspect.ts';
import {
	formatInspectCustom,
	INSPECT_CUSTOM,
	isInspectCustomAvailable,
	withInspectCustom,
} from '../../../src/utils/inspect-custom.ts';

test('Bun.inspect serializes objects like console.log', () => {
	const obj = {foo: 'bar'};
	const rendered = formatValue(obj, {colors: false});
	expect(rendered).toContain('foo');
	expect(rendered).toContain('bar');
});

test('Bun.inspect formats typed arrays per utils docs', () => {
	const arr = new Uint8Array([1, 2, 3]);
	const rendered = formatValue(arr, {colors: false});
	expect(rendered).toContain('Uint8Array');
	expect(rendered).toContain('1');
	expect(rendered).toContain('3');
});

test('Bun.inspect.table renders tabular rows', () => {
	const table = formatTable(
		[
			{a: 1, b: 2, c: 3},
			{a: 4, b: 5, c: 6},
		],
		['a', 'b', 'c'],
		{colors: false},
	);
	expect(table).toContain('a');
	expect(table).toContain('1');
	expect(table).toContain('6');
});

test('Bun.inspect.table supports column subsets', () => {
	const table = formatTable(
		[
			{a: 1, b: 2, c: 3},
			{a: 4, b: 5, c: 6},
		],
		['a', 'c'],
		{colors: false},
	);
	expect(table).toContain('a');
	expect(table).toContain('c');
	expect(table).not.toContain('b');
});

test('inspect.custom formatter overrides object rendering', () => {
	class Foo {
		[INSPECT_CUSTOM]() {
			return 'foo';
		}
	}
	const rendered = formatInspectCustom(new Foo(), {colors: false});
	expect(rendered).toBe('foo');
});

test('withInspectCustom attaches formatter to plain objects', () => {
	const value = withInspectCustom({id: 1}, () => 'custom-row');
	expect(formatInspectCustom(value, {colors: false})).toBe('custom-row');
});

test('isInspectAvailable and isInspectCustomAvailable reflect runtime', () => {
	expect(isInspectAvailable()).toBe(typeof Bun.inspect === 'function');
	expect(isInspectCustomAvailable()).toBe(isInspectAvailable());
});

test('docs URL points at runtime inspect reference', () => {
	expect(BUN_INSPECT_DOCS_URL).toContain('bun-inspect');
});