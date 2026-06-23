export interface PackageSnapshot {
	name: string;
	version: string;
	requestedRange?: string;
}

/**
 * Load a snapshot of the project's direct dependencies from package.json.
 * Falls back to version ranges when resolved versions cannot be determined.
 */
export async function loadPackageSnapshot(
	packageJsonPath = './package.json',
): Promise<PackageSnapshot[]> {
	const file = Bun.file(packageJsonPath);
	if (!(await file.exists())) {
		return [];
	}

	const pkg = await file.json();
	const deps = {
		...pkg.dependencies,
		...pkg.devDependencies,
	};

	return Object.entries(deps).map(([name, range]) => ({
		name,
		version: extractVersion(range as string),
		requestedRange: range as string,
	}));
}

function extractVersion(range: string): string {
	// Strip leading range operators and keep the first semver-looking token.
	const match = range.match(/(\d+\.\d+\.\d+)/);
	return match?.[1] ?? '0.0.0';
}

/**
 * Convert a snapshot entry into a Bun.Security.Package for scanning.
 */
export function toSecurityPackage(snapshot: PackageSnapshot): Bun.Security.Package {
	return {
		name: snapshot.name,
		version: snapshot.version,
		requestedRange: snapshot.requestedRange ?? snapshot.version,
		tarball: '',
	};
}
