import {expect, test} from 'bun:test';
import path from 'path';
import {
	isApprovedTestPath,
	listTestFilesForSlice,
	matchesTestGlobPatterns,
	matchesTestSliceCliFilters,
	matchesTestSliceGlob,
	testSliceCliFilters,
	testSliceFilter,
	TEST_SLICE_GLOBS,
	TEST_TOP_LEVEL_SLICES,
} from '../../src/domain/test-layout.ts';

test('testSliceFilter returns trailing-slash CLI substring filters', () => {
	expect(testSliceFilter('network')).toBe('network/');
	expect(testSliceFilter('domain-runtime')).toBe('domain-runtime/');
	expect(testSliceCliFilters('domain')).toEqual(['domain/']);
});

test('domain glob excludes domain-runtime paths', () => {
	expect(matchesTestSliceGlob('domain/doctor.test.ts', 'domain')).toBe(true);
	expect(matchesTestSliceGlob('domain-runtime/vault.test.ts', 'domain')).toBe(false);
	expect(TEST_SLICE_GLOBS.domain).toEqual(['domain/**', '!domain-runtime/**']);
});

test('matchesTestGlobPatterns follows archive include and exclude rules', () => {
	expect(matchesTestGlobPatterns('network/loop.test.ts', ['network/**'])).toBe(true);
	expect(
		matchesTestGlobPatterns('domain-runtime/x.test.ts', ['domain/**', '!domain-runtime/**']),
	).toBe(false);
	expect(matchesTestGlobPatterns('any.test.ts', ['!utils/**'])).toBe(false);
});

test('CLI domain filter excludes domain-runtime unlike bare domain substring', () => {
	const cliFilters = testSliceCliFilters('domain');
	expect(matchesTestSliceCliFilters('domain/foo.test.ts', cliFilters)).toBe(true);
	expect(matchesTestSliceCliFilters('domain-runtime/foo.test.ts', cliFilters)).toBe(false);
	expect('domain-runtime/foo.test.ts'.includes('domain')).toBe(true);
});

test('isApprovedTestPath accepts slice tests and root support files', () => {
	expect(isApprovedTestPath('network/loop.test.ts')).toBe(true);
	expect(isApprovedTestPath('domain-runtime/vault.test.ts')).toBe(true);
	expect(isApprovedTestPath('conventions/bun/bun-test-api.test.ts')).toBe(true);
	expect(isApprovedTestPath('helpers.ts')).toBe(true);
	expect(isApprovedTestPath('orphan.test.ts')).toBe(false);
});

test('listTestFilesForSlice returns sorted paths for network slice', async () => {
	const files = await listTestFilesForSlice(path.join(import.meta.dir, '..'), 'network');
	expect(files.length).toBeGreaterThan(0);
	expect(files.every(path => matchesTestSliceGlob(path, 'network'))).toBe(true);
});

test('TEST_TOP_LEVEL_SLICES includes domain-runtime and conventions', () => {
	expect(TEST_TOP_LEVEL_SLICES as readonly string[]).toContain('domain-runtime');
	expect(TEST_TOP_LEVEL_SLICES as readonly string[]).toContain('conventions');
});