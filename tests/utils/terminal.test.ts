import {expect, test} from 'bun:test';
import {padVisible, stringWidth, stripAnsi, wrapAnsi} from '../../src/utils/terminal.ts';

test('stringWidth ignores ANSI escapes by default', () => {
	expect(stringWidth('hello')).toBe(5);
	expect(stringWidth('\u001b[31mhello\u001b[0m')).toBe(5);
	expect(stringWidth('\u001b[31mhello\u001b[0m', {countAnsiEscapeCodes: true})).toBe(12);
});

test('stripAnsi removes escape codes', () => {
	expect(stripAnsi('\u001b[31mhello\u001b[0m')).toBe('hello');
});

test('wrapAnsi wraps to column width', () => {
	const wrapped = wrapAnsi('hello world', 8);
	expect(wrapped).toContain('\n');
});

test('padVisible pads to visible width', () => {
	expect(stringWidth(padVisible('hi', 5))).toBe(5);
});