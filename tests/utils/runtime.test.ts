import {expect, test} from 'bun:test';
import {
	deepEquals,
	filePathFromModuleUrl,
	getRuntimeInfo,
	isMainModule,
	moduleUrlFromPath,
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

test('isMainModule is true for the test entrypoint', () => {
	expect(isMainModule(import.meta.path)).toBe(import.meta.path === Bun.main);
});

test('validateBunRuntime reports required APIs as available', () => {
	const validation = validateBunRuntime();
	expect(validation.ok).toBe(true);
	expect(validation.missing).toEqual([]);
	expect(validation.info.version).toBe(Bun.version);
	expect(validation.wrapperCatalog.entries.length).toBeGreaterThan(5);
	expect(validation.wrapperCatalog.entries.some(entry => entry.id === 'spawn')).toBe(true);
});
