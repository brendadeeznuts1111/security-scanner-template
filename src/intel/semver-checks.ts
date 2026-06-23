import path from 'path';
import type {DomainConfig} from '../config/types.ts';
import type {DoctorIssue} from '../config/doctor.ts';

import type {SemverRule} from '../policy/types.ts';
import {semverRulesFromDocument} from '../policy/semver.ts';
import type {PolicyDocument} from '../policy/types.ts';
import {SemverMatcher} from '../provider/semver-matcher.ts';
import {loadProjectPolicies} from '../policy/loader.ts';
import {
	checkPolicyConstraintViolations,
	collectConstraintDoctorIssues,
} from './constraint-checks.ts';
import {collectEndpointDoctorIssues} from './endpoint-scan.ts';
import {checkPolicySemverViolations, type UnifiedSemverViolation} from './semver-violations.ts';
import {constraintsFromDocument} from '../policy/constraints.ts';

export interface InstalledPackageVersion {
	name: string;
	version: string;
}

/** @deprecated Use UnifiedSemverViolation — kept for Registry compatibility. */
export interface PackageSemverViolation {
	package: string;
	version: string;
	rule: SemverRule;
}

export interface PackageSemverScanReport {
	domain: string;
	root: string;
	scanned: number;
	violations: PackageSemverViolation[];
}

async function readInstalledPackageVersion(
	root: string,
	packageName: string,
): Promise<string | null> {
	const pkgPath = path.join(root, 'node_modules', packageName, 'package.json');
	const file = Bun.file(pkgPath);
	if (!(await file.exists())) {
		return null;
	}
	try {
		const meta = (await file.json()) as {version?: string};
		return typeof meta.version === 'string' ? meta.version : null;
	} catch {
		return null;
	}
}

/** Read dependency names from the project package.json. */
export async function readProjectDependencyNames(root: string): Promise<string[]> {
	const file = Bun.file(path.join(root, 'package.json'));
	if (!(await file.exists())) {
		return [];
	}
	try {
		const pkg = (await file.json()) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		return [
			...new Set([
				...Object.keys(pkg.dependencies ?? {}),
				...Object.keys(pkg.devDependencies ?? {}),
			]),
		].sort();
	} catch {
		return [];
	}
}

/** Resolve installed versions for all package.json dependencies. */
export async function readProjectDependencyVersions(
	root: string,
): Promise<InstalledPackageVersion[]> {
	const names = await readProjectDependencyNames(root);
	return listInstalledDependencyVersions(root, names);
}

/** Check explicit package versions against unified policy semver constraints. */
export async function checkPackageVersionsAgainstPolicy(
	root: string,
	packages: Record<string, string>,
): Promise<PackageSemverViolation[]> {
	const policy = await loadProjectPolicies(root);
	return checkPolicySemverViolations(packages, policy)
		.filter((violation): violation is UnifiedSemverViolation & {rule: SemverRule} =>
			Boolean(violation.rule),
		)
		.map(violation => ({
			package: violation.package,
			version: violation.version,
			rule: violation.rule,
		}));
}

export {type UnifiedSemverViolation} from './semver-violations.ts';

/** Read installed versions for dependency names declared in package.json. */
export async function listInstalledDependencyVersions(
	root: string,
	packageNames: readonly string[],
): Promise<InstalledPackageVersion[]> {
	const versions: InstalledPackageVersion[] = [];
	for (const name of packageNames) {
		const version = await readInstalledPackageVersion(root, name);
		if (version) {
			versions.push({name, version});
		}
	}
	return versions;
}

/** Resolve threat-feed version from cache file when present. */
export async function readThreatFeedVersion(
	root: string,
	config: DomainConfig,
): Promise<string | null> {
	const cachePath = config.supplyChain.feed?.cachePath;
	if (!cachePath) return null;

	const absolute = path.isAbsolute(cachePath) ? cachePath : path.join(root, cachePath);
	const file = Bun.file(absolute);
	if (!(await file.exists())) return null;

	try {
		const parsed = (await file.json()) as Record<string, unknown>;
		const data = parsed.data;
		if (typeof data === 'object' && data !== null) {
			const nested = data as Record<string, unknown>;
			if (typeof nested.version === 'string') return nested.version;
			if (typeof nested.feedVersion === 'string') return nested.feedVersion;
		}
		if (typeof parsed.version === 'string') return parsed.version;
		if (typeof parsed.feedVersion === 'string') return parsed.feedVersion;
	} catch {
		return null;
	}
	return null;
}

export function checkFeedMinVersion(
	feedVersion: string | null,
	minRange: string | undefined,
): {ok: boolean; message?: string} {
	if (!minRange) return {ok: true};
	if (!feedVersion) {
		return {ok: false, message: `Threat feed version unknown; required ${minRange}`};
	}
	if (!SemverMatcher.satisfies(feedVersion, minRange)) {
		return {
			ok: false,
			message: `Threat feed ${feedVersion} does not satisfy ${minRange}`,
		};
	}
	return {ok: true};
}

export function findSemverPolicyViolations(
	packages: readonly InstalledPackageVersion[],
	rules: readonly SemverRule[],
): Array<{rule: SemverRule; version: string}> {
	const violations: Array<{rule: SemverRule; version: string}> = [];
	for (const pkg of packages) {
		const rule = SemverMatcher.checkRule(pkg.name, pkg.version, rules);
		if (rule) {
			violations.push({rule, version: pkg.version});
		}
	}
	return violations;
}

export function findPackageRangeViolations(
	packages: readonly InstalledPackageVersion[],
	ranges: Record<string, string> | undefined,
): Array<{package: string; version: string; required: string}> {
	if (!ranges) return [];
	const violations: Array<{package: string; version: string; required: string}> = [];
	for (const pkg of packages) {
		const required = ranges[pkg.name];
		if (!required) continue;
		if (!SemverMatcher.satisfies(pkg.version, required)) {
			violations.push({package: pkg.name, version: pkg.version, required});
		}
	}
	return violations;
}

/** Collect doctor issues for intel.semver and policy semver rules. */
export async function collectSemverDoctorIssues(
	root: string,
	domain: string,
	domainPath: string,
	config: DomainConfig,
	policyDocument: PolicyDocument | null,
): Promise<DoctorIssue[]> {
	const issues: DoctorIssue[] = [];
	const intel = config.intel?.semver;
	const policyRules = semverRulesFromDocument(policyDocument);
	const policyPackages = policyDocument?.semver?.packages ?? {};

	const policyConstraints = constraintsFromDocument(policyDocument);
	const watched = new Set<string>([
		...Object.keys(intel?.packageRanges ?? {}),
		...Object.keys(policyPackages),
		...Object.keys(policyDocument?.semver?.blocked ?? {}),
		...policyRules.map(rule => rule.package),
		...(policyConstraints.block ?? []).map(entry => entry.package),
		...(policyConstraints.require ?? []).map(entry => entry.package),
	]);
	const installed = await listInstalledDependencyVersions(root, [...watched]);

	if (intel?.feedMinVersion) {
		const feedVersion = await readThreatFeedVersion(root, config);
		const feedCheck = checkFeedMinVersion(feedVersion, intel.feedMinVersion);
		if (!feedCheck.ok) {
			issues.push({
				domain,
				path: domainPath,
				field: 'intel.semver.feedMinVersion',
				message: feedCheck.message ?? 'Threat feed version incompatible',
				severity: 'warning',
				code: 'SEMVER_FEED_INCOMPATIBLE',
			});
		}
	}

	for (const violation of findPackageRangeViolations(installed, intel?.packageRanges)) {
		issues.push({
			domain,
			path: domainPath,
			field: `intel.semver.packageRanges.${violation.package}`,
			message: `${violation.package}@${violation.version} does not satisfy ${violation.required}`,
			severity: 'warning',
			code: 'SEMVER_PACKAGE_RANGE',
		});
	}

	const installedMap = Object.fromEntries(installed.map(pkg => [pkg.name, pkg.version]));
	const constraintViolations = [
		...checkPolicySemverViolations(installedMap, policyDocument),
		...checkPolicyConstraintViolations(installedMap, policyDocument),
	];
	for (const violation of constraintViolations) {
		const severity =
			violation.severity === 'critical' || violation.severity === 'high' ? 'error' : 'warning';
		const field =
			violation.source === 'policy-blocked'
				? `policy.semver.blocked.${violation.package}`
				: violation.source === 'policy-allowed'
					? `policy.semver.packages.${violation.package}`
					: violation.source === 'policy-constraint-block'
						? `policy.constraints.block.${violation.package}`
						: violation.source === 'policy-constraint-allow'
							? 'policy.constraints.strictAllowlist'
							: violation.source === 'policy-constraint-require'
								? `policy.constraints.require.${violation.package}`
								: `policy.semver.${violation.ruleId ?? violation.package}`;
		issues.push({
			domain,
			path: domainPath,
			field,
			message: violation.message,
			severity,
			code: violation.source.startsWith('policy-constraint')
				? 'POLICY_CONSTRAINT'
				: 'SEMVER_POLICY_RULE',
		});
	}

	for (const deepIssue of await collectConstraintDoctorIssues(
		root,
		domain,
		domainPath,
		policyDocument,
	)) {
		issues.push(deepIssue);
	}

	for (const endpointIssue of await collectEndpointDoctorIssues(
		root,
		domain,
		domainPath,
		config,
		policyDocument,
	)) {
		issues.push(endpointIssue);
	}

	return issues;
}
