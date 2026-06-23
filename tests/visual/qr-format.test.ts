import {expect, test} from 'bun:test';
import {resolveQrOutputFormat} from '../../src/visual/qr-format.ts';

test('resolveQrOutputFormat prefers --terminal', () => {
	expect(resolveQrOutputFormat({terminal: true, output: 'x.png'})).toBe('terminal');
});

test('resolveQrOutputFormat uses --format when set', () => {
	expect(resolveQrOutputFormat({format: 'webp', output: 'x.svg'})).toBe('webp');
});

test('resolveQrOutputFormat infers from extension', () => {
	expect(resolveQrOutputFormat({output: 'token.png'})).toBe('png');
	expect(resolveQrOutputFormat({output: 'token.webp'})).toBe('webp');
	expect(resolveQrOutputFormat({output: 'token.svg'})).toBe('svg');
});

test('resolveQrOutputFormat defaults to svg for unknown extension', () => {
	expect(resolveQrOutputFormat({output: 'token.out'})).toBe('svg');
});

test('resolveQrOutputFormat returns undefined without output flags', () => {
	expect(resolveQrOutputFormat({})).toBeUndefined();
});
