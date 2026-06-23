import {expect, test} from 'bun:test';
import path from 'path';
import {
	isApprovedTestPath,
	isConcurrentTestFileName,
	isTestSupportFile,
	isValidTestFileStem,
	listTestFilesForSlice,
	matchesTestSliceCliFilters,
	matchesTestSliceGlob,
	TEST_CONVENTIONS_BUN_DIR,
	TEST_ROOT_SUPPORT_FILES,
	TEST_SLICE_CLI_FILTERS,
	TEST_TOP_LEVEL_SLICES,
	testSliceCliFilters,
	topLevelTestSlice,
} from '../../src/domain/test-layout.ts';

const TESTS_ROOT = path.join(import.meta.dir, '..');

test('tests root only allows support files outside slice directories', () => {
	const glob = new Bun.Glob('*');
	const entries = [...glob.scanSync({cwd: TESTS_ROOT})];
	const violations = entries.filter(
		entry => entry.endsWith('.ts') && !isTestSupportFile(entry) && !entry.endsWith('.helper.ts'),
	);
	expect(violations).toEqual([]);
	expect([...TEST_ROOT_SUPPORT_FILES].sort()).toEqual(['helpers.ts', 'setup.ts']);
});

test('every test file lives under an approved top-level slice', async () => {
	const glob = new Bun.Glob('**/*.test.ts');
	const violations: string[] = [];
	for (const relative of glob.scanSync({cwd: TESTS_ROOT})) {
		if (!isApprovedTestPath(relative)) {
			violations.push(relative);
		}
	}
	expect(violations).toEqual([]);
});

test('test file stems use kebab-case', async () => {
	const glob = new Bun.Glob('**/*.test.ts');
	const violations: string[] = [];
	for (const relative of glob.scanSync({cwd: TESTS_ROOT})) {
		const fileName = path.basename(relative);
		if (!isValidTestFileStem(fileName)) {
			violations.push(relative);
		}
	}
	expect(violations).toEqual([]);
});

test('bun conformance tests are grouped under conventions/bun', async () => {
	const glob = new Bun.Glob('**/bun-*.test.ts');
	const misplaced: string[] = [];
	for (const relative of glob.scanSync({cwd: TESTS_ROOT})) {
		if (!relative.startsWith(`${TEST_CONVENTIONS_BUN_DIR}/`)) {
			misplaced.push(relative);
		}
	}
	expect(misplaced).toEqual([]);
});

test('glob slices align with bun test CLI substring filters', async () => {
	const slices = ['domain', 'domain-runtime', 'network', 'conventions'] as const;
	for (const slice of slices) {
		const globFiles = await listTestFilesForSlice(TESTS_ROOT, slice);
		const cliFilters = testSliceCliFilters(slice);
		expect(TEST_SLICE_CLI_FILTERS[slice]).toBeDefined();

		for (const relative of globFiles) {
			expect(matchesTestSliceCliFilters(relative, cliFilters)).toBe(true);
		}

		const allGlob = new Bun.Glob('**/*.test.ts');
		for (const relative of allGlob.scanSync({cwd: TESTS_ROOT})) {
			if (!matchesTestSliceCliFilters(relative, cliFilters)) continue;
			expect(matchesTestSliceGlob(relative, slice)).toBe(true);
		}
	}
});

test('concurrent-prefixed tests declare slice in path', () => {
	const glob = new Bun.Glob(`**/${'concurrent-'}*.test.ts`);
	for (const relative of glob.scanSync({cwd: TESTS_ROOT})) {
		const slice = topLevelTestSlice(relative);
		expect(slice).not.toBeNull();
		if (!slice) continue;
		expect(TEST_TOP_LEVEL_SLICES as readonly string[]).toContain(slice);
		expect(isConcurrentTestFileName(path.basename(relative))).toBe(true);
	}
});