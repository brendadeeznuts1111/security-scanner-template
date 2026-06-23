import path from 'path';
import {checkPlatformPathLength} from '../utils/platform-runtime.ts';
import {access} from 'fs/promises';
import type {DoctorIssue} from '../config/doctor.ts';

export const IMPLICIT_OPTIONAL_PEER_CODE = 'IMPLICIT_OPTIONAL_PEER';

export interface PackageManifestSlice {
	name?: string;
	peerDependencies?: Record<string, string>;
	peerDependenciesMeta?: Record<string, {optional?: boolean}>;
}

export interface PeerMetaCheckResult {
	ok: boolean;
	issues: DoctorIssue[];
	warnings: number;
	packagesScanned: number;
}

/**
 * Detect peer names declared only in peerDependenciesMeta (Bun >=1.3.14 synthesizes
 * an implicit optional "*" peer for each, matching pnpm/yarn).
 */
export function findImplicitOptionalPeerNames(manifest: PackageManifestSlice): string[] {
	const meta = manifest.peerDependenciesMeta;
	if (!meta || Object.keys(meta).length === 0) {
		return [];
	}

	const peers = manifest.peerDependencies ?? {};
	return Object.keys(meta).filter(peer => !(peer in peers));
}

/**
 * Build doctor issues for one installed package manifest.
 */
export function issuesForPackageManifest(
	packageName: string,
	packageJsonPath: string,
	manifest: PackageManifestSlice,
): DoctorIssue[] {
	const implicitPeers = findImplicitOptionalPeerNames(manifest);
	if (implicitPeers.length === 0) {
		return [];
	}

	const meta = manifest.peerDependenciesMeta ?? {};
	const optionalPeers = implicitPeers.filter(peer => meta[peer]?.optional === true);
	const requiredMetaOnly = implicitPeers.filter(peer => meta[peer]?.optional !== true);

	const issues: DoctorIssue[] = [];

	if (optionalPeers.length > 0) {
		issues.push({
			code: IMPLICIT_OPTIONAL_PEER_CODE,
			domain: 'supply-chain',
			path: packageJsonPath,
			field: `dependencies.${packageName}.peerDependenciesMeta`,
			message:
				`Package "${packageName}" lists optional peers only in peerDependenciesMeta (${optionalPeers.join(', ')}). ` +
				`Bun synthesizes an implicit "*" optional peer for these entries (>=1.3.14, pnpm/yarn parity). ` +
				`Ensure threat-intel version ranges include reachable versions of these packages.`,
			severity: 'warning',
		});
	}

	if (requiredMetaOnly.length > 0) {
		issues.push({
			code: IMPLICIT_OPTIONAL_PEER_CODE,
			domain: 'supply-chain',
			path: packageJsonPath,
			field: `dependencies.${packageName}.peerDependenciesMeta`,
			message:
				`Package "${packageName}" lists non-optional peers only in peerDependenciesMeta (${requiredMetaOnly.join(', ')}). ` +
				`Resolution may differ between package managers; verify dependency trees when matching CVE ranges.`,
			severity: 'warning',
		});
	}

	return issues;
}

async function readManifest(packageJsonPath: string): Promise<PackageManifestSlice | null> {
	const file = Bun.file(packageJsonPath);
	if (!(await file.exists())) {
		return null;
	}

	try {
		return JSON.parse(await file.text()) as PackageManifestSlice;
	} catch {
		return null;
	}
}

/**
 * Scan installed packages under node_modules for implicit optional peer patterns.
 */
export async function checkPeerDependenciesMeta(
	root: string = process.cwd(),
): Promise<PeerMetaCheckResult> {
	const nodeModules = path.join(root, 'node_modules');
	try {
		await access(nodeModules);
	} catch {
		return {ok: true, issues: [], warnings: 0, packagesScanned: 0};
	}

	const issues: DoctorIssue[] = [];
	const seen = new Set<string>();
	let packagesScanned = 0;

	const glob = new Bun.Glob('**/package.json');
	for await (const relativePath of glob.scan({cwd: nodeModules, onlyFiles: true})) {
		if (relativePath.startsWith('.bin/')) {
			continue;
		}

		const packageJsonPath = path.join(nodeModules, relativePath);
		if (seen.has(packageJsonPath)) {
			continue;
		}

		const pathCheck = checkPlatformPathLength(packageJsonPath);
		if (!pathCheck.safe) {
			continue;
		}

		seen.add(packageJsonPath);

		const manifest = await readManifest(packageJsonPath);
		if (!manifest) {
			continue;
		}

		packagesScanned += 1;
		const packageName = manifest.name ?? relativePath.replace(/\/package\.json$/, '');
		issues.push(...issuesForPackageManifest(packageName, packageJsonPath, manifest));
	}

	return {
		ok: issues.length === 0,
		issues,
		warnings: issues.length,
		packagesScanned,
	};
}
