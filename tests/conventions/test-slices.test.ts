import {expect, test} from 'bun:test';
import {readFileSync} from 'fs';
import path from 'path';
import {
	listTestFilesForSlice,
	PACKAGE_TEST_SLICES,
	TEST_SLICE_GLOBS,
	type PackageTestSlice,
} from '../../src/domain/test-layout.ts';

const PACKAGE_JSON = path.join(import.meta.dir, '../../package.json');
const TESTS_ROOT = path.join(import.meta.dir, '..');

test('package.json slice scripts use glob-based test-slice runner', () => {
	const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')) as {scripts: Record<string, string>};
	for (const slice of PACKAGE_TEST_SLICES) {
		const script = `test:${slice}`;
		expect(pkg.scripts[script]).toBe(`bun run scripts/test-slice.ts ${slice}`);
	}
});

test('intel glob excludes threat-intel paths', async () => {
	const intelFiles = await listTestFilesForSlice(TESTS_ROOT, 'intel');
	const threatFiles = await listTestFilesForSlice(TESTS_ROOT, 'threat-intel');
	expect(intelFiles.length).toBeGreaterThan(0);
	expect(threatFiles.length).toBeGreaterThan(0);
	for (const file of intelFiles) {
		expect(file.startsWith('threat-intel/')).toBe(false);
	}
	expect(TEST_SLICE_GLOBS.intel).toContain('!threat-intel/**');
});

test('each package slice discovers at least one test file', async () => {
	for (const slice of PACKAGE_TEST_SLICES) {
		const files = await listTestFilesForSlice(TESTS_ROOT, slice as PackageTestSlice);
		expect(files.length).toBeGreaterThan(0);
	}
});
