import path from 'path';
import {parseToml} from '../config/toml.ts';
import {extractConstraintsConfigFromToml, hasPolicyConstraints} from './constraints.ts';
import {extractEndpointProbesFromToml} from './endpoints.ts';
import {extractPatternsConfigFromToml, hasPatternRules} from './patterns.ts';
import {extractSemverConfigFromToml} from './semver.ts';
import type {
	PolicyConstraintsConfig,
	PolicyIntelConfig,
	PolicyDocument,
	PolicyPatternsConfig,
	PolicySnapshotConfig,
} from './types.ts';

export const DEFAULT_POLICY_FILE = 'security.policy.toml';

/**
 * Load a single policy document from a TOML file path.
 */
export async function loadPolicy(filePath: string): Promise<PolicyDocument> {
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		return {};
	}

	const text = await file.text();
	if (text.trim().length === 0) {
		return {};
	}

	const parsed = parseToml(text) as PolicyDocument;
	return normalizePolicy(parsed);
}

/**
 * Discover policy files in a project root.
 *
 * Looks for the root `security.policy.toml` and any `security.policy.toml`
 * files directly inside workspace folders (one level deep). Returns an array of
 * absolute paths.
 */
export async function discoverPolicyFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const rootPolicy = path.resolve(root, DEFAULT_POLICY_FILE);

	if (await Bun.file(rootPolicy).exists()) {
		files.push(rootPolicy);
	}

	try {
		const {readdir} = await import('fs/promises');
		const entries = await readdir(root, {withFileTypes: true});
		for (const entry of entries) {
			if (entry.isDirectory()) {
				const workspacePolicy = path.resolve(root, entry.name, DEFAULT_POLICY_FILE);
				if (await Bun.file(workspacePolicy).exists()) {
					files.push(workspacePolicy);
				}
			}
		}
	} catch {
		// If we can't read the root, return only the root policy if it exists.
	}

	return files;
}

/**
 * Load all discovered policy documents from a project root, merged in order.
 */
export async function loadProjectPolicies(root: string): Promise<PolicyDocument> {
	const files = await discoverPolicyFiles(root);
	const docs = await Promise.all(files.map(loadPolicy));

	return docs.reduce((acc, doc) => {
		const mergedPatterns: PolicyPatternsConfig = {
			regex: [...(acc.patterns?.regex ?? []), ...(doc.patterns?.regex ?? [])],
			ast: [...(acc.patterns?.ast ?? []), ...(doc.patterns?.ast ?? [])],
		};
		const mergedIntel: PolicyIntelConfig = {
			endpoints: [...(acc.intel?.endpoints ?? []), ...(doc.intel?.endpoints ?? [])],
		};
		const mergedConstraints: PolicyConstraintsConfig = {
			strictAllowlist: doc.constraints?.strictAllowlist ?? acc.constraints?.strictAllowlist,
			scanTransitive: doc.constraints?.scanTransitive ?? acc.constraints?.scanTransitive,
			strictLicenseAllowlist:
				doc.constraints?.strictLicenseAllowlist ?? acc.constraints?.strictLicenseAllowlist,
			allow: [...(acc.constraints?.allow ?? []), ...(doc.constraints?.allow ?? [])],
			block: [...(acc.constraints?.block ?? []), ...(doc.constraints?.block ?? [])],
			require: [...(acc.constraints?.require ?? []), ...(doc.constraints?.require ?? [])],
			blockImport: [
				...(acc.constraints?.blockImport ?? []),
				...(doc.constraints?.blockImport ?? []),
			],
			blockLicense: [
				...(acc.constraints?.blockLicense ?? []),
				...(doc.constraints?.blockLicense ?? []),
			],
			allowLicense: [
				...(acc.constraints?.allowLicense ?? []),
				...(doc.constraints?.allowLicense ?? []),
			],
			blockSource: [
				...(acc.constraints?.blockSource ?? []),
				...(doc.constraints?.blockSource ?? []),
			],
		};
		return {
			default: {...acc.default, ...doc.default},
			override: [...(acc.override ?? []), ...(doc.override ?? [])],
			snapshot: doc.snapshot ?? acc.snapshot,
			semver: {
				rules: [...(acc.semver?.rules ?? []), ...(doc.semver?.rules ?? [])],
				packages: {...acc.semver?.packages, ...doc.semver?.packages},
				blocked: {...acc.semver?.blocked, ...doc.semver?.blocked},
			},
			patterns: hasPatternRules(mergedPatterns) ? mergedPatterns : acc.patterns,
			constraints: hasPolicyConstraints(mergedConstraints) ? mergedConstraints : acc.constraints,
			intel: (mergedIntel.endpoints?.length ?? 0) > 0 ? mergedIntel : acc.intel,
		};
	}, {} as PolicyDocument);
}

function normalizePolicy(parsed: unknown): PolicyDocument {
	if (typeof parsed !== 'object' || parsed === null) {
		return {};
	}

	const doc = parsed as Record<string, unknown>;
	const policy = (doc.policy as Record<string, unknown>) ?? {};

	const default_ = (policy.default as Record<string, unknown>) ?? {};
	const overrides = Array.isArray(policy.override) ? policy.override : [];

	const defaultOut: import('./types.ts').PolicyDefault = {};
	if (Array.isArray(default_.fatal)) defaultOut.fatal = default_.fatal as string[];
	if (Array.isArray(default_.warn)) defaultOut.warn = default_.warn as string[];
	if (Array.isArray(default_.info)) defaultOut.info = default_.info as string[];

	const snapshot = parseSnapshotSection(doc.snapshot);
	const semverConfig = extractSemverConfigFromToml(parsed);
	const hasSemver =
		semverConfig.rules.length > 0 ||
		Object.keys(semverConfig.packages ?? {}).length > 0 ||
		Object.keys(semverConfig.blocked ?? {}).length > 0;
	const patternsConfig = extractPatternsConfigFromToml(parsed);
	const constraintsConfig = extractConstraintsConfigFromToml(parsed);
	const endpointProbes = extractEndpointProbesFromToml(parsed);
	const intelConfig: PolicyIntelConfig | undefined =
		endpointProbes.length > 0 ? {endpoints: endpointProbes} : undefined;

	return {
		default: defaultOut,
		override: overrides.map(o => o as import('./types.ts').PolicyRule),
		snapshot,
		semver: hasSemver ? semverConfig : undefined,
		patterns: hasPatternRules(patternsConfig) ? patternsConfig : undefined,
		constraints: hasPolicyConstraints(constraintsConfig) ? constraintsConfig : undefined,
		intel: intelConfig,
	};
}

function parseSnapshotSection(value: unknown): PolicySnapshotConfig | undefined {
	if (typeof value !== 'object' || value === null) {
		return undefined;
	}
	const section = value as Record<string, unknown>;
	const allowedDrift = Array.isArray(section.allowedDrift)
		? (section.allowedDrift as string[])
		: undefined;
	const requiredSections = Array.isArray(section.requiredSections)
		? (section.requiredSections as string[])
		: undefined;
	const snapshotVersionRange =
		typeof section.snapshotVersionRange === 'string' ? section.snapshotVersionRange : undefined;
	const compatibleScannerVersions =
		typeof section.compatibleScannerVersions === 'string'
			? section.compatibleScannerVersions
			: undefined;
	if (!allowedDrift && !requiredSections && !snapshotVersionRange && !compatibleScannerVersions) {
		return undefined;
	}
	return {allowedDrift, requiredSections, snapshotVersionRange, compatibleScannerVersions};
}
