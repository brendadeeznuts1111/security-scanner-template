/**
 * Canonical `tests/` tree layout and CI slice filters.
 * @see https://bun.com/docs/test/discovery#position-arguments-as-filters
 */

/** Support files allowed at `tests/` root (not `*.test.ts`). */
export const TEST_ROOT_SUPPORT_FILES = ['helpers.ts', 'setup.ts'] as const;

/**
 * Approved top-level directories under `tests/` (kebab-case, mirror `src/` modules).
 * `conventions/` holds repo-wide test policy; `domain-runtime/` mirrors `src/domains/`.
 */
export const TEST_TOP_LEVEL_SLICES = [
	'audit',
	'build',
	'cli',
	'color',
	'config',
	'conventions',
	'core',
	'crypto',
	'csrf',
	'domain',
	'domain-runtime',
	'features',
	'image',
	'integrity',
	'intel',
	'interactive',
	'logging',
	'markdown',
	'network',
	'policy',
	'provider',
	'registry',
	'report',
	'scan',
	'scripts',
	'security',
	'semver',
	'service',
	'shell',
	'supply-chain',
	'threat-feed',
	'threat-intel',
	'utils',
	'visual',
	'xref',
] as const;

export type TestTopLevelSlice = (typeof TEST_TOP_LEVEL_SLICES)[number];

/** Bun conformance + serial tests (not run concurrently with each other). */
export const TEST_CONVENTIONS_BUN_DIR = 'conventions/bun';

/** Filename prefix for tests safe under `concurrentTestGlob`. */
export const TEST_CONCURRENT_FILE_PREFIX = 'concurrent-';

/** Kebab-case test file stem: `doctor-snapshot.test.ts`, `concurrent-resolve-config.test.ts`. */
export const TEST_FILE_STEM_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const TOP_LEVEL_SLICE_SET = new Set<string>(TEST_TOP_LEVEL_SLICES);
const SUPPORT_FILE_SET = new Set<string>(TEST_ROOT_SUPPORT_FILES);

export function isTestSupportFile(relativePath: string): boolean {
	return !relativePath.includes('/') && SUPPORT_FILE_SET.has(relativePath);
}

export function topLevelTestSlice(relativePath: string): string | null {
	const slash = relativePath.indexOf('/');
	return slash === -1 ? null : relativePath.slice(0, slash);
}

export function isApprovedTestPath(relativePath: string): boolean {
	if (relativePath.endsWith('.test.ts')) {
		const slice = topLevelTestSlice(relativePath);
		return slice !== null && TOP_LEVEL_SLICE_SET.has(slice);
	}
	if (!relativePath.includes('/')) {
		return isTestSupportFile(relativePath) || relativePath.endsWith('.helper.ts');
	}
	return false;
}

export function isConcurrentTestFileName(fileName: string): boolean {
	return fileName.startsWith(TEST_CONCURRENT_FILE_PREFIX);
}

export function isValidTestFileStem(fileName: string): boolean {
	if (!fileName.endsWith('.test.ts')) return false;
	const stem = fileName.slice(0, -'.test.ts'.length);
	return TEST_FILE_STEM_PATTERN.test(stem);
}

/** Position-argument filter for `bun test` with `root = "tests"`. */
export function testSliceFilter(slice: TestTopLevelSlice | typeof TEST_CONVENTIONS_BUN_DIR): string {
	return `${slice}/`;
}