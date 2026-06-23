import path from 'path';
import type {InstalledPackageVersion} from './semver-checks.ts';

export interface InstalledPackageRecord extends InstalledPackageVersion {
	/** Relative path from project root to the directory containing package.json. */
	installDir?: string;
}

export interface DependencySpecifier {
	name: string;
	specifier: string;
	kind: 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies';
	/** Workspace package.json that declared the dependency, relative to project root. */
	workspace?: string;
}

const DEPENDENCY_KINDS = [
	'dependencies',
	'devDependencies',
	'optionalDependencies',
	'peerDependencies',
] as const;

/** Resolve node_modules path for a package name (supports scoped packages). */
export function resolveInstalledPackageDir(root: string, packageName: string): string {
	return path.join(root, 'node_modules', ...packageName.split('/'));
}

/** Absolute path to an installed package's package.json. */
export function resolveInstalledPackageJsonPath(
	root: string,
	packageName: string,
	installDir?: string,
): string {
	if (installDir) {
		return path.join(root, installDir, 'package.json');
	}
	return path.join(resolveInstalledPackageDir(root, packageName), 'package.json');
}

/** Read declared dependency specifiers from a single package.json. */
export async function readProjectDependencySpecifiers(
	root: string,
	workspace?: string,
): Promise<DependencySpecifier[]> {
	const file = Bun.file(path.join(root, 'package.json'));
	if (!(await file.exists())) {
		return [];
	}

	try {
		const pkg = (await file.json()) as Record<string, Record<string, string> | undefined>;
		const out: DependencySpecifier[] = [];
		for (const kind of DEPENDENCY_KINDS) {
			for (const [name, specifier] of Object.entries(pkg[kind] ?? {})) {
				out.push({name, specifier, kind, workspace});
			}
		}
		return out.sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		return [];
	}
}

/** Workspace glob patterns from root package.json. */
export async function readWorkspaceGlobPatterns(root: string): Promise<string[]> {
	const file = Bun.file(path.join(root, 'package.json'));
	if (!(await file.exists())) {
		return [];
	}
	try {
		const pkg = (await file.json()) as {workspaces?: string[] | {packages?: string[]}};
		const workspaces = pkg.workspaces;
		if (Array.isArray(workspaces)) {
			return workspaces;
		}
		if (typeof workspaces === 'object' && workspaces !== null && Array.isArray(workspaces.packages)) {
			return workspaces.packages;
		}
	} catch {
		/* unreadable */
	}
	return [];
}

/** Discover workspace package roots (directories with package.json). */
export async function discoverWorkspacePackageRoots(root: string): Promise<string[]> {
	const patterns = await readWorkspaceGlobPatterns(root);
	if (patterns.length === 0) {
		return [];
	}

	const roots = new Set<string>();
	for (const pattern of patterns) {
		const glob = new Bun.Glob(pattern.endsWith('/package.json') ? pattern : `${pattern}/package.json`);
		for await (const match of glob.scan({cwd: root, onlyFiles: true})) {
			roots.add(path.dirname(match));
		}
	}
	return [...roots].sort();
}

/** Read dependency specifiers from root and every workspace package.json. */
export async function readAllProjectDependencySpecifiers(root: string): Promise<DependencySpecifier[]> {
	const merged = await readProjectDependencySpecifiers(root);
	const seen = new Set(merged.map(spec => `${spec.workspace ?? ''}:${spec.kind}:${spec.name}`));

	for (const workspaceRel of await discoverWorkspacePackageRoots(root)) {
		const workspaceRoot = path.join(root, workspaceRel);
		for (const spec of await readProjectDependencySpecifiers(workspaceRoot, workspaceRel)) {
			const key = `${spec.workspace ?? ''}:${spec.kind}:${spec.name}`;
			if (seen.has(key)) continue;
			seen.add(key);
			merged.push(spec);
		}
	}

	return merged.sort((a, b) =>
		`${a.workspace ?? ''}:${a.name}`.localeCompare(`${b.workspace ?? ''}:${b.name}`),
	);
}

/** Read SPDX license from an installed package's package.json. */
export async function readInstalledPackageLicense(
	root: string,
	packageName: string,
	installDir?: string,
): Promise<string | null> {
	const file = Bun.file(resolveInstalledPackageJsonPath(root, packageName, installDir));
	if (!(await file.exists())) {
		return null;
	}
	try {
		const meta = (await file.json()) as {license?: string | {type?: string} | Array<{type?: string}>};
		const license = meta.license;
		if (typeof license === 'string') {
			return license;
		}
		if (Array.isArray(license)) {
			return license
				.map(entry => (typeof entry === 'object' && entry?.type ? entry.type : String(entry)))
				.join(' OR ');
		}
		if (typeof license === 'object' && license?.type) {
			return license.type;
		}
		return null;
	} catch {
		return null;
	}
}

/** List every unique package name + version under node_modules (transitive). */
export async function listAllInstalledPackages(root: string): Promise<InstalledPackageRecord[]> {
	const modulesRoot = path.join(root, 'node_modules');
	try {
		const {stat} = await import('fs/promises');
		if (!(await stat(modulesRoot)).isDirectory()) {
			return [];
		}
	} catch {
		return [];
	}

	const glob = new Bun.Glob('**/package.json');
	const packages = new Map<string, InstalledPackageRecord>();

	for await (const match of glob.scan({cwd: modulesRoot, onlyFiles: true})) {
		if (match.startsWith('.bin/')) continue;
		const installDir = path.join('node_modules', path.dirname(match));
		const metaPath = path.join(modulesRoot, match);
		try {
			const meta = (await Bun.file(metaPath).json()) as {name?: string; version?: string};
			if (typeof meta.name === 'string' && typeof meta.version === 'string') {
				const existing = packages.get(meta.name);
				if (!existing || installDir.length < (existing.installDir?.length ?? Infinity)) {
					packages.set(meta.name, {
						name: meta.name,
						version: meta.version,
						installDir,
					});
				}
			}
		} catch {
			/* skip unreadable */
		}
	}

	return [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
}