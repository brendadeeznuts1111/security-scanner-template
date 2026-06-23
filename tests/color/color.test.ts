import {expect, test} from 'bun:test';
import {
	ansiCode,
	colorize,
	cssVariables,
	isValidColor,
	isValidConfigColor,
	normalizeHex,
	severityColor,
	TERMINAL,
	toCss,
	toColorNumber,
	toRgbArray,
	toRgbObject,
	toRgbaArray,
	toRgbaObject,
} from '../../src/color/index.ts';

test('normalizeHex converts named colors to uppercase hex', () => {
	expect(normalizeHex('red')).toBe('#FF0000');
	expect(normalizeHex('#FF453A')).toBe('#FF453A');
});

test('isValidColor rejects unknown inputs', () => {
	expect(isValidColor('red')).toBe(true);
	expect(isValidColor('not-a-color')).toBe(false);
	expect(isValidColor(null)).toBe(false);
});

test('isValidConfigColor requires a normalizable 6-digit hex', () => {
	expect(isValidConfigColor('#0A84FF')).toBe(true);
	expect(isValidConfigColor('red')).toBe(true);
	expect(isValidConfigColor('not-a-color')).toBe(false);
});

test('toCss returns compact CSS color strings', () => {
	expect(toCss('#0A84FF')).toBe('#0a84ff');
});

test('toRgbaObject extracts channels with css-style alpha', () => {
	expect(toRgbaObject('red')).toEqual({r: 255, g: 0, b: 0, a: 1});
	expect(toRgbaObject('hsl(0, 0%, 50%)')).toEqual({r: 128, g: 128, b: 128, a: 1});
});

test('toRgbObject omits alpha channel', () => {
	expect(toRgbObject('red')).toEqual({r: 255, g: 0, b: 0});
});

test('toRgbaArray uses 0-255 alpha per Bun.color docs', () => {
	expect(toRgbaArray('red')).toEqual([255, 0, 0, 255]);
	expect(toRgbArray('red')).toEqual([255, 0, 0]);
});

test('toColorNumber returns 24-bit integer', () => {
	expect(toColorNumber('red')).toBe(0xff0000);
});

test('ansiCode returns a string for valid colors', () => {
	expect(typeof ansiCode(TERMINAL.fatal)).toBe('string');
});

test('colorize returns plain text when ANSI is unavailable', () => {
	expect(colorize(TERMINAL.success, 'ok')).toContain('ok');
});

test('severityColor maps labels to palette entries', () => {
	expect(severityColor('error')).toBe(TERMINAL.fatal);
	expect(severityColor('warning')).toBe(TERMINAL.warn);
	expect(severityColor('info')).toBe(TERMINAL.info);
});

test('cssVariables emits custom property declarations', () => {
	const css = cssVariables({fatal: '#FF453A', warn: '#FF9500'});
	expect(css).toContain('--domain-fatal: #ff453a;');
	expect(css).toContain('--domain-warn: #ff9500;');
});
