import type {DomainConfig} from '../config/types.ts';
import type {SemverRule, SemverRuleSeverity} from '../policy/types.ts';
import {
	semverConstraintsFromDocument,
	semverRulesFromDocument,
} from '../policy/semver.ts';
import type {PolicyDocument} from '../policy/types.ts';
import type {ThreatFeedEntry} from '../provider/feed-types.ts';
import {safeRangeFromThreat} from './semver-ranges.ts';
import {SemverMatcher} from '../provider/semver-matcher.ts';

export type SemverViolationSource =
	| 'policy-rule'
	| 'policy-allowed'
	| 'policy-blocked'
	| 'policy-constraint-block'
	| 'policy-constraint-allow'
	| 'policy-constraint-require'
	| 'policy-constraint-import'
	| 'policy-constraint-license'
	| 'policy-constraint-source'
	| 'intel-range'
	| 'threat-feed';

export interface UnifiedSemverViolation {
	package: string;
	version: string;
	source: SemverViolationSource;
	severity: SemverRuleSeverity;
	message: string;
	ruleId?: string;
	cve?: string;
	safeRange?: string;
	/** Vulnerable semver range from threat feed (for remediation derivation). */
	vulnerableRange?: string;
	rule?: SemverRule;
}

function severityFromThreat(item: ThreatFeedEntry): SemverRuleSeverity {
	return item.severity;
}

/** Check policy `[[semver.rule]]`, allowed, and blocked constraints. */
export function checkPolicySemverViolations(
	packages: Record<string, string>,
	policy: PolicyDocument | null | undefined,
): UnifiedSemverViolation[] {
	const violations: UnifiedSemverViolation[] = [];
	const rules = semverRulesFromDocument(policy);
	const constraints = semverConstraintsFromDocument(policy);

	for (const [pkg, version] of Object.entries(packages)) {
		const rule = SemverMatcher.checkRule(pkg, version, rules);
		if (rule) {
			violations.push({
				package: pkg,
				version,
				source: 'policy-rule',
				severity: rule.severity,
				message: rule.description,
				ruleId: rule.id,
				safeRange: rule.safeRange,
				rule,
			});
		}

		const allowed = constraints.packages[pkg];
		if (allowed && !SemverMatcher.satisfies(version, allowed)) {
			violations.push({
				package: pkg,
				version,
				source: 'policy-allowed',
				severity: 'high',
				message: `${pkg}@${version} does not satisfy allowed range ${allowed}`,
				safeRange: allowed,
			});
		}

		const blocked = constraints.blocked[pkg];
		if (blocked && SemverMatcher.satisfies(version, blocked)) {
			violations.push({
				package: pkg,
				version,
				source: 'policy-blocked',
				severity: 'critical',
				message: `${pkg}@${version} matches blocked range ${blocked}`,
			});
		}
	}

	return violations;
}

export function checkIntelPackageRangeViolations(
	packages: Record<string, string>,
	config: DomainConfig,
): UnifiedSemverViolation[] {
	const ranges = config.intel?.semver?.packageRanges;
	if (!ranges) return [];

	const violations: UnifiedSemverViolation[] = [];
	for (const [pkg, version] of Object.entries(packages)) {
		const required = ranges[pkg];
		if (!required) continue;
		if (!SemverMatcher.satisfies(version, required)) {
			violations.push({
				package: pkg,
				version,
				source: 'intel-range',
				severity: 'high',
				message: `${pkg}@${version} does not satisfy ${required}`,
				safeRange: required,
			});
		}
	}
	return violations;
}

/** Match installed packages against threat-feed entries by version range. */
export function checkThreatFeedViolations(
	packages: Record<string, string>,
	threats: readonly ThreatFeedEntry[],
): UnifiedSemverViolation[] {
	const violations: UnifiedSemverViolation[] = [];
	for (const threat of threats) {
		for (const [pkg, version] of Object.entries(packages)) {
			if (pkg !== threat.package) continue;
			if (!SemverMatcher.satisfies(version, threat.versionRange)) continue;
			const cve = threat.id.startsWith('CVE-') ? threat.id : undefined;
			violations.push({
				package: pkg,
				version,
				source: 'threat-feed',
				severity: severityFromThreat(threat),
				message: threat.description || `${pkg}@${version} is vulnerable`,
				ruleId: threat.id,
				cve,
				vulnerableRange: threat.versionRange,
				safeRange: safeRangeFromThreat(threat),
			});
		}
	}
	return violations;
}

export function mergeSemverViolations(
	...groups: UnifiedSemverViolation[][]
): UnifiedSemverViolation[] {
	const seen = new Set<string>();
	const merged: UnifiedSemverViolation[] = [];
	for (const group of groups) {
		for (const violation of group) {
			const key = `${violation.package}:${violation.version}:${violation.source}:${violation.ruleId ?? ''}`;
			if (seen.has(key)) continue;
			seen.add(key);
			merged.push(violation);
		}
	}
	return merged;
}