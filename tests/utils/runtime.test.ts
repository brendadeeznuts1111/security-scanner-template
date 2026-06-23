import {expect, test} from 'bun:test';
import {
	deepEquals,
	escapeHtml,
	filePathFromModuleUrl,
	getRuntimeInfo,
	isMainModule,
	moduleUrlFromPath,
	nanoseconds,
	peekStatus,
	peekValue,
	validateBunRuntime,
} from '../../src/utils/runtime.ts';

test('getRuntimeInfo returns version and revision', () => {
	const info = getRuntimeInfo();
	expect(info.version.length).toBeGreaterThan(0);
	expect(info.revision.length).toBeGreaterThan(0);
	expect(info.main.length).toBeGreaterThan(0);
});

test('deepEquals matches nested objects', () => {
	expect(deepEquals({a: {b: 1}}, {a: {b: 1}})).toBe(true);
	expect(deepEquals({a: 1}, {a: 2})).toBe(false);
	expect(deepEquals({a: undefined}, {}, true)).toBe(false);
});

test('filePathFromModuleUrl and moduleUrlFromPath round-trip', () => {
	const path = filePathFromModuleUrl(import.meta.url);
	expect(path.endsWith('runtime.test.ts')).toBe(true);
	expect(moduleUrlFromPath(path).protocol).toBe('file:');
});

test('nanoseconds returns a positive integer', () => {
	expect(Number.isInteger(nanoseconds())).toBe(true);
	expect(nanoseconds()).toBeGreaterThan(0);
});

test('peekValue and peekStatus read settled promises', () => {
	const fulfilled = Promise.resolve('ok');
	expect(peekValue(fulfilled)).toBe('ok');
	expect(peekStatus(fulfilled)).toBe('fulfilled');

	const pending = new Promise(() => {});
	expect(peekValue(pending)).toBe(pending);
	expect(peekStatus(pending)).toBe('pending');
});

test('escapeHtml escapes HTML metacharacters', () => {
	expect(escapeHtml(`<script>"&'</script>`)).toBe('&lt;script&gt;&quot;&amp;&#x27;&lt;/script&gt;');
});

test('isMainModule is true for the test entrypoint', () => {
	expect(isMainModule(import.meta.path)).toBe(import.meta.path === Bun.main);
});

test('validateBunRuntime reports required APIs as available', () => {
	const validation = validateBunRuntime();
	expect(validation.ok).toBe(true);
	expect(validation.missing).toEqual([]);
	expect(validation.info.version).toBe(Bun.version);
});
