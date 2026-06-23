/**
 * Canonical `tests/` tree layout, glob slices, and CI filters.
 *
 * Test discovery uses substring position args (`bun test network/`).
 * Monorepo script fan-out uses `bun run --filter` — see `src/utils/bun-run-filter.ts`.
 *
 * @see https://bun.com/docs/test/discovery#position-arguments-as-filters
 * @see https://bun.com/docs/runtime/archive#filtering-with-glob-patterns
 * @see https://bun.com/docs/runtime#filtering
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
	'workflow',
	'xref',
] as const;

export type TestTopLevelSlice = (typeof TEST_TOP_LEVEL_SLICES)[number];

export type TestSliceId = TestTopLevelSlice | typeof TEST_CONVENTIONS_BUN_DIR | 'conventions';

/** Bun conformance + serial tests (not run concurrently with each other). */
export const TEST_CONVENTIONS_BUN_DIR = 'conventions/bun';

/** Filename prefix for tests safe under `concurrentTestGlob`. */
export const TEST_CONCURRENT_FILE_PREFIX = 'concurrent-';

/** Kebab-case test file stem: `doctor-snapshot.test.ts`, `concurrent-resolve-config.test.ts`. */
export const TEST_FILE_STEM_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Glob slices for programmatic discovery (Bun.Archive / Bun.Glob semantics).
 * Positive patterns include; `!` prefixes exclude. Negative-only lists match nothing.
 */
/** Slices exposed as `bun run test:<name>` scripts (glob-accurate via scripts/test-slice.ts). */
export const PACKAGE_TEST_SLICES = [
	'domain',
	'domain-runtime',
	'network',
	'conventions',
	'intel',
	'cli',
] as const;

export type PackageTestSlice = (typeof PACKAGE_TEST_SLICES)[number];

export const TEST_SLICE_GLOBS: Record<TestSliceId, readonly string[]> = {
	'domain': ['domain/**', '!domain-runtime/**'],
	'domain-runtime': ['domain-runtime/**'],
	'network': ['network/**'],
	'conventions': ['conventions/**'],
	'cli': ['cli/**'],
	'intel': ['intel/**', '!threat-intel/**'],
	'audit': ['audit/**'],
	'build': ['build/**'],
	'color': ['color/**'],
	'config': ['config/**'],
	'core': ['core/**'],
	'crypto': ['crypto/**'],
	'csrf': ['csrf/**'],
	'features': ['features/**'],
	'image': ['image/**'],
	'integrity': ['integrity/**'],
	'interactive': ['interactive/**'],
	'logging': ['logging/**'],
	'markdown': ['markdown/**'],
	'policy': ['policy/**'],
	'provider': ['provider/**'],
	'registry': ['registry/**'],
	'report': ['report/**'],
	'scan': ['scan/**'],
	'scripts': ['scripts/**'],
	'security': ['security/**'],
	'semver': ['semver/**'],
	'service': ['service/**'],
	'shell': ['shell/**'],
	'supply-chain': ['supply-chain/**'],
	'threat-feed': ['threat-feed/**'],
	'threat-intel': ['threat-intel/**'],
	'utils': ['utils/**'],
	'visual': ['visual/**'],
	'workflow': ['workflow/**'],
	'xref': ['xref/**'],
	'conventions/bun': ['conventions/bun/**'],
};

/**
 * `bun test` position filters (substring matches, not globs) with `root = "tests"`.
 * Trailing slash avoids accidental overlap (e.g. `domain` ⊂ `domain-runtime`).
 */
export const TEST_SLICE_CLI_FILTERS: Partial<Record<TestSliceId, readonly string[]>> = {
	'domain': ['domain/'],
	'domain-runtime': ['domain-runtime/'],
	'network': ['network/'],
	'conventions': ['conventions/'],
	'cli': ['cli/'],
	'intel': ['intel/'],
};

/**
 * Paths excluded from CLI substring filters where overlap is unavoidable
 * (`intel/` matches `threat-intel/`). Glob slices remain authoritative.
 */
export const TEST_SLICE_CLI_EXCLUSIONS: Partial<Record<TestSliceId, readonly string[]>> = {
	intel: ['threat-intel/'],
};

const TOP_LEVEL_SLICE_SET = new Set<string>(TEST_TOP_LEVEL_SLICES);
const SUPPORT_FILE_SET = new Set<string>(TEST_ROOT_SUPPORT_FILES);

export function normalizeTestRelativePath(relativePath: string): string {
	return relativePath.replaceAll('\\', '/');
}

/**
 * Match a tests-relative path against Bun glob patterns (archive-style include/exclude).
 */
export function matchesTestGlobPatterns(
	relativePath: string,
	patterns: readonly string[],
): boolean {
	const normalized = normalizeTestRelativePath(relativePath);
	const positive = patterns.filter(pattern => !pattern.startsWith('!'));
	const negative = patterns
		.filter(pattern => pattern.startsWith('!'))
		.map(pattern => pattern.slice(1));

	if (positive.length === 0) {
		return false;
	}

	const included = positive.some(pattern => new Bun.Glob(pattern).match(normalized));
	if (!included) {
		return false;
	}

	return !negative.some(pattern => new Bun.Glob(pattern).match(normalized));
}

export function matchesTestSliceGlob(relativePath: string, slice: TestSliceId): boolean {
	return matchesTestGlobPatterns(relativePath, TEST_SLICE_GLOBS[slice]);
}

/** List `*.test.ts` paths under `testsRoot` for a glob-defined slice. */
export async function listTestFilesForSlice(
	testsRoot: string,
	slice: TestSliceId,
): Promise<string[]> {
	const patterns = TEST_SLICE_GLOBS[slice];
	const glob = new Bun.Glob('**/*.test.ts');
	const matched: string[] = [];
	for await (const relative of glob.scan({cwd: testsRoot, onlyFiles: true})) {
		if (matchesTestGlobPatterns(relative, patterns)) {
			matched.push(relative);
		}
	}
	return matched.sort();
}

/** `bun test` position-argument filters for a slice (substring discovery). */
export function testSliceCliFilters(slice: TestSliceId): readonly string[] {
	return TEST_SLICE_CLI_FILTERS[slice] ?? [`${slice}/`];
}

/** Primary CLI filter for package.json scripts. */
export function testSliceFilter(slice: TestSliceId): string {
	return testSliceCliFilters(slice)[0] ?? `${slice}/`;
}

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

/** Substring filter used by `bun test` (position args) for a tests-relative path. */
export function matchesTestSliceCliFilters(
	relativePath: string,
	filters: readonly string[],
	exclusions: readonly string[] = [],
): boolean {
	const normalized = normalizeTestRelativePath(relativePath);
	if (exclusions.some(exclusion => normalized.includes(exclusion))) {
		return false;
	}
	return filters.some(filter => normalized.includes(filter));
}

export function testSliceCliExclusions(slice: TestSliceId): readonly string[] {
	return TEST_SLICE_CLI_EXCLUSIONS[slice] ?? [];
}
