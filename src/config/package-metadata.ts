import {readProjectBunTypesVersion} from '../utils/platform-runtime.ts';

export interface PackageMetadata {
	name: string;
	version: string;
	description?: string;
	license?: string;
	homepage?: string;
	repository?: string;
	bunEngine?: string;
	bunTypesVersion?: string | null;
	dependencyCount: number;
	devDependencyCount: number;
	optionalDependencyCount: number;
	peerDependencyCount: number;
	/** package.json byte size when the file exists. */
	fileSize?: number;
	/** package.json mtime ms when the file exists. */
	lastModified?: number;
}

function dependencyCount(value: unknown): number {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? Object.keys(value).length
		: 0;
}

function repositoryUrl(value: unknown): string | undefined {
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		const url = (value as Record<string, unknown>).url;
		return typeof url === 'string' ? url : undefined;
	}
	return undefined;
}

/**
 * Extract publishable and runtime metadata from a package.json file.
 */
export async function extractPackageMetadata(
	packageJsonPath = `${process.cwd()}/package.json`,
): Promise<PackageMetadata | null> {
	const file = Bun.file(packageJsonPath);
	if (!(await file.exists())) {
		return null;
	}

	const pkg = (await file.json()) as Record<string, unknown>;
	const name = typeof pkg.name === 'string' ? pkg.name : 'unknown';
	const version = typeof pkg.version === 'string' ? pkg.version : '0.0.0';

	const engines =
		typeof pkg.engines === 'object' && pkg.engines !== null
			? (pkg.engines as Record<string, unknown>)
			: undefined;

	return {
		name,
		version,
		description: typeof pkg.description === 'string' ? pkg.description : undefined,
		license: typeof pkg.license === 'string' ? pkg.license : undefined,
		homepage: typeof pkg.homepage === 'string' ? pkg.homepage : undefined,
		repository: repositoryUrl(pkg.repository),
		bunEngine: typeof engines?.bun === 'string' ? engines.bun : undefined,
		bunTypesVersion: await readProjectBunTypesVersion(packageJsonPath),
		dependencyCount: dependencyCount(pkg.dependencies),
		devDependencyCount: dependencyCount(pkg.devDependencies),
		optionalDependencyCount: dependencyCount(pkg.optionalDependencies),
		peerDependencyCount: dependencyCount(pkg.peerDependencies),
		fileSize: file.size,
		lastModified: file.lastModified,
	};
}
