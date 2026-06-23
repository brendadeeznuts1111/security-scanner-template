import type {DomainConfig} from '../config/types.ts';
import {loadProjectPolicies} from '../policy/loader.ts';
import {FeedParser} from '../provider/feed-parser.ts';
import type {FeedConfig} from '../provider/feed.ts';
import type {ThreatFeedEntry} from '../provider/feed-types.ts';
import {
	checkPolicyConstraintViolations,
	filterViolationsByConstraintAllowlist,
	scanPolicyConstraints,
} from './constraint-checks.ts';
import type {ConstraintViolation} from './constraint-types.ts';
import {
	checkIntelPackageRangeViolations,
	checkPolicySemverViolations,
	checkThreatFeedViolations,
	mergeSemverViolations,
	type UnifiedSemverViolation,
} from './semver-violations.ts';
import {suggestRemediation, type RemediationSuggestion} from './semver-remediation.ts';
import {scanDomainEndpointProbes} from './endpoint-scan.ts';
import type {EndpointProbeReport} from './endpoint-types.ts';

export interface SemverScanOptions {
	root: string;
	domain: string;
	config: DomainConfig;
	includeThreatFeed?: boolean;
	includeRemediation?: boolean;
	/** Include license/source/import/transitive constraint violations. */
	deepConstraints?: boolean;
	transitive?: boolean;
	sourcePath?: string;
	/** HTTP `/meta` and health endpoint probes. */
	probeEndpoints?: boolean;
	probeTimeoutMs?: number;
	/** Pre-loaded threat entries (e.g. from `Registry.loadThreatFeed`). */
	threatEntries?: readonly ThreatFeedEntry[];
}

export interface SemverViolationWithRemediation extends UnifiedSemverViolation {
	remediation?: RemediationSuggestion;
}

export interface SemverScanReport {
	domain: string;
	root: string;
	scanned: number;
	violations: SemverViolationWithRemediation[];
	/** Deep constraint violations when `deepConstraints` is enabled. */
	constraintViolations?: ConstraintViolation[];
	/** Endpoint meta probe report when `probeEndpoints` is enabled. */
	endpointProbes?: EndpointProbeReport;
}

export async function scanPackageSemverViolations(
	packages: Record<string, string>,
	options: SemverScanOptions,
): Promise<SemverScanReport> {
	const policy = await loadProjectPolicies(options.root);
	const groups: UnifiedSemverViolation[][] = [
		checkPolicySemverViolations(packages, policy),
		checkPolicyConstraintViolations(packages, policy),
		checkIntelPackageRangeViolations(packages, options.config),
	];

	if (options.includeThreatFeed) {
		let threats: readonly ThreatFeedEntry[];
		if (options.threatEntries) {
			threats = options.threatEntries;
		} else {
			const feedConfig: FeedConfig = {
				local: options.config.supplyChain.feed?.local,
				remote: options.config.supplyChain.feed?.remote,
				cachePath: options.config.supplyChain.feed?.cachePath,
				cacheTtl: options.config.supplyChain.feed?.cacheTtl,
			};
			const parser = new FeedParser(feedConfig);
			await parser.loadThreats();
			threats = parser.getActiveThreats();
		}
		groups.push(checkThreatFeedViolations(packages, threats));
	}

	const merged = filterViolationsByConstraintAllowlist(mergeSemverViolations(...groups), policy);
	const violations: SemverViolationWithRemediation[] = [];

	for (const violation of merged) {
		const entry: SemverViolationWithRemediation = {...violation};
		if (options.includeRemediation !== false) {
			if (violation.rule) {
				entry.remediation = await suggestRemediation({...violation, rule: violation.rule});
			} else if (violation.safeRange) {
				entry.remediation = await suggestRemediation(violation);
			} else if (violation.vulnerableRange) {
				entry.remediation = await suggestRemediation({
					...violation,
					safeRange: undefined,
					rule: {
						id: violation.ruleId ?? 'threat-feed',
						package: violation.package,
						range: violation.vulnerableRange,
						severity: violation.severity,
						description: violation.message,
					},
				});
			}
		}
		violations.push(entry);
	}

	let constraintViolations: ConstraintViolation[] | undefined;
	if (options.deepConstraints) {
		const constraintReport = await scanPolicyConstraints({
			root: options.root,
			policy,
			domain: options.domain,
			transitive: options.transitive,
			sourcePath: options.sourcePath,
		});
		constraintViolations = constraintReport.violations;
	}

	let endpointProbes: EndpointProbeReport | undefined;
	if (options.probeEndpoints) {
		endpointProbes = await scanDomainEndpointProbes({
			root: options.root,
			domain: options.domain,
			config: options.config,
			policy,
			timeoutMs: options.probeTimeoutMs,
		});
	}

	return {
		domain: options.domain,
		root: options.root,
		scanned: Object.keys(packages).length,
		violations,
		constraintViolations,
		endpointProbes,
	};
}
