/**
 * Bun runtime `bun run --filter` workspace script selection.
 * @see https://bun.com/docs/runtime#filtering
 * @see https://bun.com/docs/pm/filter
 */
import path from 'path';
import {discoverWorkspacePackageRoots} from '../intel/constraint-packages.ts';

export const BUN_RUNTIME_FILTER_DOCS_URL = 'https://bun.com/docs/runtime#filtering';
export const BUN_PM_FILTER_DOCS_URL = 'https://bun.com/docs/pm/filter';

export interface BunRunFilterFlag {
	id: string;
	flag: string;
	description: string;
	docsUrl: string;
}

export interface WorkspacePackageEntry {
	name: string;
	/** Directory relative to monorepo root (`'.'` for root). */
	path: string;
}

export const BUN_RUN_FILTER_FLAGS: readonly BunRunFilterFlag[] = [
	{
		id: 'filter',
		flag: '--filter',
		description: 'Run a script in workspace packages whose name or path matches a glob pattern',
		docsUrl: BUN_PM_FILTER_DOCS_URL,
	},
	{
		id: 'workspaces',
		flag: '--workspaces',
		description: 'Run a script in every package listed in package.json workspaces',
		docsUrl: BUN_RUNTIME_FILTER_DOCS_URL,
	},
	{
		id: 'parallel',
		flag: '--parallel',
		description: 'Run filtered workspace scripts concurrently with prefixed output',
		docsUrl: BUN_RUNTIME_FILTER_DOCS_URL,
	},
	{
		id: 'sequential',
		flag: '--sequential',
		description: 'Run filtered workspace scripts one after another with prefixed output',
		docsUrl: BUN_RUNTIME_FILTER_DOCS_URL,
	},
	{
		id: 'no-exit-on-error',
		flag: '--no-exit-on-error',
		description: 'With --parallel/--sequential, continue when one package script fails',
		docsUrl: BUN_RUNTIME_FILTER_DOCS_URL,
	},
	{
		id: 'elide-lines',
		flag: '--elide-lines',
		description: 'Lines of script output shown per package when using --filter (0 = all)',
		docsUrl: BUN_RUNTIME_FILTER_DOCS_URL,
	},
	{
		id: 'if-present',
		flag: '--if-present',
		description: 'Skip workspace packages that do not define the requested script',
		docsUrl: BUN_RUNTIME_FILTER_DOCS_URL,
	},
] as const;

export interface FormatBunRunFilterOptions {
	filter?: string;
	workspaces?: boolean;
	parallel?: boolean;
	sequential?: boolean;
	noExitOnError?: boolean;
	elideLines?: number;
	ifPresent?: boolean;
}

/** True when the pattern selects by filesystem path (`./packages/**`). */
export function isPackagePathFilter(pattern: string): boolean {
	return pattern.startsWith('./') || pattern.startsWith('!./');
}

function normalizeWorkspacePath(relativePath: string): string {
	return relativePath.replaceAll('\\', '/').replace(/\/$/, '') || '.';
}

/** Match a workspace package name against a Bun `--filter` name glob. */
export function matchPackageNameFilter(pattern: string, packageName: string): boolean {
	if (isPackagePathFilter(pattern)) {
		return false;
	}
	const negated = pattern.startsWith('!');
	const globPattern = negated ? pattern.slice(1) : pattern;
	const matched = new Bun.Glob(globPattern).match(packageName);
	return negated ? !matched : matched;
}

/** Match a workspace directory against a Bun `--filter` path glob (`./packages/**`). */
export function matchPackagePathFilter(pattern: string, relativePath: string): boolean {
	if (!isPackagePathFilter(pattern)) {
		return false;
	}
	const negated = pattern.startsWith('!');
	const raw = negated ? pattern.slice(1) : pattern;
	const globPattern = raw.startsWith('./') ? raw.slice(2) : raw;
	const dir = normalizeWorkspacePath(relativePath);
	const matched =
		new Bun.Glob(globPattern).match(dir) || new Bun.Glob(globPattern).match(`${dir}/package.json`);
	return negated ? !matched : matched;
}

/** Match one workspace entry against a single `--filter` pattern. */
export function matchWorkspaceFilter(pattern: string, entry: WorkspacePackageEntry): boolean {
	if (isPackagePathFilter(pattern)) {
		return matchPackagePathFilter(pattern, entry.path);
	}
	return matchPackageNameFilter(pattern, entry.name);
}

/** Apply one or more `--filter` patterns (union: any pattern may match). */
export function filterWorkspacePackages(
	entries: readonly WorkspacePackageEntry[],
	patterns: readonly string[],
): WorkspacePackageEntry[] {
	if (patterns.length === 0) {
		return [...entries];
	}
	return entries.filter(entry => patterns.some(pattern => matchWorkspaceFilter(pattern, entry)));
}

/** Discover workspace package names from package.json workspaces globs. */
export async function discoverWorkspacePackages(root: string): Promise<WorkspacePackageEntry[]> {
	const entries: WorkspacePackageEntry[] = [];
	const rootPkg = path.join(root, 'package.json');
	try {
		const pkg = (await Bun.file(rootPkg).json()) as {name?: string};
		if (typeof pkg.name === 'string' && pkg.name.length > 0) {
			entries.push({name: pkg.name, path: '.'});
		}
	} catch {
		/* no root package */
	}

	for (const workspaceRel of await discoverWorkspacePackageRoots(root)) {
		const pkgPath = path.join(root, workspaceRel, 'package.json');
		try {
			const pkg = (await Bun.file(pkgPath).json()) as {name?: string};
			const name = typeof pkg.name === 'string' && pkg.name.length > 0 ? pkg.name : workspaceRel;
			entries.push({name, path: normalizeWorkspacePath(workspaceRel)});
		} catch {
			entries.push({name: workspaceRel, path: normalizeWorkspacePath(workspaceRel)});
		}
	}

	const seen = new Set<string>();
	return entries.filter(entry => {
		const key = `${entry.path}:${entry.name}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** Build a `bun run` command with workspace filter flags. */
export function formatBunRunFilterCommand(
	script: string,
	options: FormatBunRunFilterOptions = {},
): string {
	const parts = ['bun', 'run'];
	if (options.parallel) parts.push('--parallel');
	if (options.sequential) parts.push('--sequential');
	if (options.noExitOnError) parts.push('--no-exit-on-error');
	if (options.ifPresent) parts.push('--if-present');
	if (options.elideLines != null) parts.push(`--elide-lines=${options.elideLines}`);
	if (options.workspaces) parts.push('--workspaces');
	if (options.filter) parts.push('--filter', JSON.stringify(options.filter));
	parts.push(script);
	return parts.join(' ');
}

/** True when Bun supports workspace script filtering (always under Bun runtime). */
export function isBunRunFilterAvailable(): boolean {
	return typeof Bun !== 'undefined';
}
