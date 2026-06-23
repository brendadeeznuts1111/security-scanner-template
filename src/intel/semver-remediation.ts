import {runBunPm} from '../utils/install-runtime.ts';
import type {SemverRule} from '../policy/types.ts';
import {SemverMatcher} from '../provider/semver-matcher.ts';
import {deriveSafeRange} from './semver-ranges.ts';
import type {UnifiedSemverViolation} from './semver-violations.ts';

export {deriveSafeRange} from './semver-ranges.ts';
export {safeRangeFromThreat} from './semver-ranges.ts';

/** Fetch published versions from the npm registry (best-effort). */
export async function fetchRegistryVersions(packageName: string): Promise<string[]> {
	try {
		const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
			headers: {accept: 'application/vnd.npm.install-v1+json'},
		});
		if (!response.ok) {
			return [];
		}
		const data = (await response.json()) as {versions?: Record<string, unknown>};
		return Object.keys(data.versions ?? {}).sort(SemverMatcher.order);
	} catch {
		return [];
	}
}

export interface RemediationSuggestion {
	safeRange: string;
	suggestedVersion: string | null;
	latestInRange: string | null;
}

export type RemediationViolation = Pick<
	UnifiedSemverViolation,
	'package' | 'version' | 'safeRange' | 'rule' | 'source' | 'ruleId'
>;

/** Compute upgrade suggestion for a violating package version. */
export async function suggestRemediation(
	violation: RemediationViolation,
	availableVersions?: string[],
): Promise<RemediationSuggestion> {
	const safeRange =
		violation.safeRange ??
		deriveSafeRange(violation.rule ?? {range: '<0.0.0', safeRange: undefined});

	const versions = availableVersions ?? (await fetchRegistryVersions(violation.package));
	const latestInRange = SemverMatcher.latestSatisfying(versions, safeRange);

	let suggestedVersion: string | null = null;
	if (latestInRange && SemverMatcher.order(latestInRange, violation.version) > 0) {
		suggestedVersion = latestInRange;
	} else if (
		violation.source === 'threat-feed' &&
		safeRange.startsWith('>=') &&
		versions.length === 0
	) {
		const minimumFix = safeRange.slice(2).trim();
		if (minimumFix && SemverMatcher.order(minimumFix, violation.version) > 0) {
			suggestedVersion = minimumFix;
			return {safeRange, suggestedVersion, latestInRange: minimumFix};
		}
	}

	return {safeRange, suggestedVersion, latestInRange};
}

export interface PlannedPackageUpgrade {
	package: string;
	fromVersion: string;
	toVersion: string;
	safeRange: string;
	sources: UnifiedSemverViolation['source'][];
	ruleIds: string[];
}

/** Collapse remediation suggestions to one upgrade per package (highest version wins). */
export function planPackageUpgrades(
	violations: readonly (RemediationViolation & {remediation?: RemediationSuggestion})[],
): PlannedPackageUpgrade[] {
	const planned = new Map<string, PlannedPackageUpgrade>();

	for (const violation of violations) {
		const target = violation.remediation?.suggestedVersion;
		if (!target) continue;

		const existing = planned.get(violation.package);
		if (!existing) {
			planned.set(violation.package, {
				package: violation.package,
				fromVersion: violation.version,
				toVersion: target,
				safeRange: violation.remediation!.safeRange,
				sources: [violation.source],
				ruleIds: violation.ruleId ? [violation.ruleId] : [],
			});
			continue;
		}

		if (SemverMatcher.order(target, existing.toVersion) > 0) {
			existing.toVersion = target;
			existing.safeRange = violation.remediation!.safeRange;
		}
		if (!existing.sources.includes(violation.source)) {
			existing.sources.push(violation.source);
		}
		if (violation.ruleId && !existing.ruleIds.includes(violation.ruleId)) {
			existing.ruleIds.push(violation.ruleId);
		}
	}

	return [...planned.values()].sort((a, b) => a.package.localeCompare(b.package));
}

export function formatRemediationLine(
	violation: UnifiedSemverViolation,
	suggestion?: RemediationSuggestion,
): string {
	const label =
		violation.source === 'threat-feed' && violation.ruleId
			? `[${violation.ruleId}] `
			: '';
	const base = `${label}${violation.package}@${violation.version} — ${violation.message}`;
	if (!suggestion?.suggestedVersion) {
		return base;
	}
	return `${base}\n   → Upgrade to ${violation.package}@${suggestion.suggestedVersion} or later (range ${suggestion.safeRange})`;
}

export function formatPlannedUpgrade(plan: PlannedPackageUpgrade): string {
	const refs =
		plan.ruleIds.length > 0 ? ` (${plan.ruleIds.join(', ')})` : '';
	return `${plan.package}@${plan.fromVersion} → ${plan.package}@${plan.toVersion}${refs}`;
}

/** Apply a single package upgrade via `bun add`. */
export async function applyPackageUpgrade(
	root: string,
	packageName: string,
	version: string,
): Promise<{ok: boolean; message: string}> {
	const result = await runBunPm(root, ['add', `${packageName}@${version}`]);
	if (result.ok) {
		return {ok: true, message: `Upgraded ${packageName} to ${version}`};
	}
	return {ok: false, message: result.message};
}

/** Apply consolidated upgrades from a scan report. */
export async function applyPlannedUpgrades(
	root: string,
	plans: readonly PlannedPackageUpgrade[],
): Promise<{ok: boolean; results: {package: string; ok: boolean; message: string}[]}> {
	const results: {package: string; ok: boolean; message: string}[] = [];
	for (const plan of plans) {
		const result = await applyPackageUpgrade(root, plan.package, plan.toVersion);
		results.push({package: plan.package, ...result});
	}
	return {ok: results.every(entry => entry.ok), results};
}