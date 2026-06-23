/**
 * Parity checks against oven-sh/bun docs/runtime/color.mdx examples.
 * @see https://github.com/oven-sh/bun/blob/main/docs/runtime/color.mdx
 */
import {expect, test} from 'bun:test';
import {
	formatColor,
	normalizeHex,
	toColorNumber,
	toCss,
	toHex,
	toRgb,
	toRgba,
	toRgbArray,
	toRgbObject,
	toRgbaArray,
	toRgbaObject,
} from '../../../src/color/index.ts';

test('docs: css format normalizes red inputs', () => {
	expect(toCss('red')).toBe('red');
	expect(toCss('#ff0000')).toBe('red');
	expect(toCss('rgb(255, 0, 0)')).toBe('red');
});

test('docs: rgba object uses 0-1 alpha', () => {
	expect(Bun.color('red', '{rgba}')).toEqual({r: 255, g: 0, b: 0, a: 1});
	expect(toRgbaObject('hsl(0, 0%, 50%)')).toEqual({r: 128, g: 128, b: 128, a: 1});
});

test('docs: rgba array uses 0-255 alpha', () => {
	expect(Bun.color('red', '[rgba]')).toEqual([255, 0, 0, 255]);
	expect(toRgbaArray('hsl(0, 0%, 50%)')).toEqual([128, 128, 128, 255]);
});

test('docs: rgb object and array omit alpha', () => {
	expect(toRgbObject('red')).toEqual({r: 255, g: 0, b: 0});
	expect(toRgbArray('red')).toEqual([255, 0, 0]);
});

test('docs: number format is 24-bit integer', () => {
	expect(Bun.color('red', 'number')).toBe(16_711_680);
	expect(toColorNumber('red')).toBe(16_711_680);
});

test('docs: hex vs HEX casing', () => {
	expect(toHex('red')).toBe('#ff0000');
	expect(normalizeHex('red')).toBe('#FF0000');
});

test('docs: rgb and rgba string formats', () => {
	expect(toRgb('red')).toBe('rgb(255, 0, 0)');
	expect(toRgba('red')).toBe('rgba(255, 0, 0, 1)');
});

test('docs: invalid input returns null', () => {
	expect(formatColor('not-a-color', 'hex')).toBeNull();
	expect(toRgbaObject('not-a-color')).toBeNull();
});

test('docs: flexible object and array inputs round-trip', () => {
	expect(toRgbaObject({r: 255, g: 0, b: 0})).toEqual({r: 255, g: 0, b: 0, a: 1});
	expect(toRgbaObject([255, 0, 0])).toEqual({r: 255, g: 0, b: 0, a: 1});
	// Numeric input matches Bun runtime (24-bit RGB; alpha may be 0).
	expect(toRgbaObject(0xff0000)).toEqual(Bun.color(0xff0000, '{rgba}'));
});