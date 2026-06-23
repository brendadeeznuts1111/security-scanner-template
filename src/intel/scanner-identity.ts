import path from 'path';
import {
	extractPackageMetadata,
	formatPackageAuthor,
	type PackageMetadata,
} from '../config/package-metadata.ts';
import type {DomainRegistry} from '../config/registry.ts';
import {domainDisplayName as resolveDomainDisplayName} from '../domain/branding.ts';
import {getRuntimeInfo, type BunRuntimeInfo} from '../utils/runtime.ts';

export interface SupplyChainPartyIdentity {
	name: string;
	version?: string;
	author?: string;
	description?: string;
	license?: string;
	homepage?: string;
	repository?: string;
}

export interface SupplyChainScanIdentity {
	capturedAt: string;
	bun: BunRuntimeInfo;
	scanner: SupplyChainPartyIdentity;
	target?: SupplyChainPartyIdentity;
	domain?: string;
	domainDisplayName?: string;
}

/** Resolve the scanner template root from a module inside `src/`. */
export function resolveScannerPackageRoot(fromModulePath: string): string {
	return path.resolve(path.dirname(fromModulePath), '..', '..');
}

function partyFromMetadata(meta: PackageMetadata | null): SupplyChainPartyIdentity | undefined {
	if (!meta) return undefined;
	return {
		name: meta.name,
		version: meta.version,
		author: formatPackageAuthor(meta.author),
		description: meta.description,
		license: meta.license,
		homepage: meta.homepage,
		repository: meta.repository,
	};
}

export interface ResolveSupplyChainScanIdentityOptions {
	scannerRoot: string;
	projectRoot?: string | null;
	domain?: string;
	registry?: DomainRegistry;
	capturedAt?: string;
}

/**
 * Collect scanner + target author/identity metadata for supply-chain reports.
 */
export async function resolveSupplyChainScanIdentity(
	options: ResolveSupplyChainScanIdentityOptions,
): Promise<SupplyChainScanIdentity> {
	const scannerMeta = await extractPackageMetadata(path.join(options.scannerRoot, 'package.json'));
	const targetMeta = options.projectRoot
		? await extractPackageMetadata(path.join(options.projectRoot, 'package.json'))
		: null;

	const resolvedDomainDisplayName =
		options.domain && options.registry?.has(options.domain)
			? resolveDomainDisplayName(options.registry.get(options.domain))
			: undefined;

	return {
		capturedAt: options.capturedAt ?? new Date().toISOString(),
		bun: getRuntimeInfo(),
		scanner: partyFromMetadata(scannerMeta) ?? {name: '@acme/bun-security-scanner', version: '0.0.0'},
		target: partyFromMetadata(targetMeta),
		domain: options.domain,
		domainDisplayName: resolvedDomainDisplayName,
	};
}