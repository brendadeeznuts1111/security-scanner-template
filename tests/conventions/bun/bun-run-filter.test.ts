import {expect, test} from 'bun:test';
import {
	BUN_PM_FILTER_DOCS_URL,
	BUN_RUNTIME_FILTER_DOCS_URL,
	BUN_RUN_FILTER_FLAGS,
	filterWorkspacePackages,
	formatBunRunFilterCommand,
	isPackagePathFilter,
	matchPackageNameFilter,
	matchPackagePathFilter,
	matchWorkspaceFilter,
} from '../../../src/utils/bun-run-filter.ts';

const SAMPLE = [
	{name: 'foo', path: '.'},
	{name: 'pkg-bar', path: 'packages/bar'},
	{name: 'pkg-baz', path: 'packages/baz'},
] as const;

test('docs urls point at runtime filtering and pm filter guides', () => {
	expect(BUN_RUNTIME_FILTER_DOCS_URL).toBe('https://bun.com/docs/runtime#filtering');
	expect(BUN_PM_FILTER_DOCS_URL).toBe('https://bun.com/docs/pm/filter');
	expect(BUN_RUN_FILTER_FLAGS.map(flag => flag.id)).toContain('filter');
	expect(BUN_RUN_FILTER_FLAGS.map(flag => flag.id)).toContain('parallel');
});

test('matchPackageNameFilter supports globs and negation', () => {
	expect(matchPackageNameFilter('pkg-*', 'pkg-bar')).toBe(true);
	expect(matchPackageNameFilter('pkg-*', 'foo')).toBe(false);
	expect(matchPackageNameFilter('!pkg-baz', 'pkg-baz')).toBe(false);
	expect(matchPackageNameFilter('!pkg-baz', 'pkg-bar')).toBe(true);
});

test('matchPackagePathFilter matches workspace directories', () => {
	expect(isPackagePathFilter('./packages/*')).toBe(true);
	expect(matchPackagePathFilter('./packages/bar', 'packages/bar')).toBe(true);
	expect(matchPackagePathFilter('./packages/*', 'packages/baz')).toBe(true);
	expect(matchPackagePathFilter('./packages/*', 'apps/baz')).toBe(false);
});

test('filterWorkspacePackages unions multiple patterns', () => {
	const filtered = filterWorkspacePackages(SAMPLE, ['pkg-bar', './packages/baz']);
	expect(filtered.map(entry => entry.name)).toEqual(['pkg-bar', 'pkg-baz']);
});

test('matchWorkspaceFilter routes name vs path patterns', () => {
	expect(matchWorkspaceFilter('pkg-*', SAMPLE[1])).toBe(true);
	expect(matchWorkspaceFilter('./packages/bar', SAMPLE[1])).toBe(true);
});

test('formatBunRunFilterCommand builds parallel workspace invocations', () => {
	expect(formatBunRunFilterCommand('test', {filter: 'pkg-*', parallel: true})).toBe(
		'bun run --parallel --filter "pkg-*" test',
	);
	expect(formatBunRunFilterCommand('build', {workspaces: true, sequential: true})).toBe(
		'bun run --sequential --workspaces build',
	);
});
