export interface PolicyDefault {
	/** Categories that trigger a fatal block. */
	fatal?: string[];
	/** Categories that trigger a warning. */
	warn?: string[];
	/** Categories that are informational only. */
	info?: string[];
}

export interface PolicyRule {
	/** Package name or glob pattern to match. */
	package?: string;
	/** Semver range to match against the advisory's package version. */
	version?: string;
	/** CVE identifier regex pattern to match. */
	cve?: string;
	/** Threat category to match. */
	category?: string;
	/** Action to apply when the rule matches. */
	action: 'ignore' | 'downgrade' | 'escalate';
	/** Target severity when downgrading or escalating. */
	to?: 'fatal' | 'warn' | 'info';
	/** Human-readable reason for the override. */
	reason: string;
}

/** Doctor snapshot drift policy (spec §17). */
export interface PolicySnapshotConfig {
	/** Sections exempt from `--fail-on-drift` CI failure. */
	allowedDrift?: string[];
	/** Sections that must be present in each domain snapshot. */
	requiredSections?: string[];
	/** Semver range accepted when reading on-disk snapshot baselines. */
	snapshotVersionRange?: string;
	/** Scanner versions compatible with on-disk snapshots (e.g. `>=2.0.0 <3.0.0`). */
	compatibleScannerVersions?: string;
}

export type SemverRuleSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SemverRule {
	id: string;
	package: string;
	range: string;
	severity: SemverRuleSeverity;
	description: string;
	category?: string;
	/** Suggested safe upgrade range for auto-remediation. */
	safeRange?: string;
}

export interface PolicySemverConfig {
	rules: SemverRule[];
	/** Global minimum allowed ranges per package (`[semver.packages]`). */
	packages?: Record<string, string>;
	/** Blocked version ranges per package (`[semver.blocked]`). */
	blocked?: Record<string, string>;
}

export type PatternRuleSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RegexPatternRule {
	id: string;
	description: string;
	severity: PatternRuleSeverity;
	/** Regex pattern applied to file contents. */
	pattern: string;
	/** Optional glob patterns limiting which files this rule applies to. */
	fileGlob?: string[];
	/** Operator remediation hint (auto-remediation catalog override). */
	remediation?: string;
}

export interface ASTPatternRule {
	id: string;
	description: string;
	severity: PatternRuleSeverity;
	/** CSS-selector-like AST query (transpiler-backed regex when no walker exists). */
	astPattern: string;
	fileGlob?: string[];
	/** Operator remediation hint (auto-remediation catalog override). */
	remediation?: string;
}

export interface PolicyPatternsConfig {
	regex?: RegexPatternRule[];
	ast?: ASTPatternRule[];
}

export interface ConstraintListEntry {
	/** Package name or glob (`@scope/*`, `lodash`). */
	package: string;
	reason: string;
	severity?: SemverRuleSeverity;
}

export interface RequiredPackageConstraint {
	package: string;
	reason: string;
	/** Installed version must satisfy this range when present. */
	range?: string;
}

export interface ImportConstraintEntry {
	/** Import specifier substring to block (`child_process`, `node:fs`). */
	pattern: string;
	reason: string;
	severity?: SemverRuleSeverity;
	fileGlob?: string[];
}

export interface LicenseConstraintEntry {
	/** SPDX license id or substring (`GPL-3.0`, `AGPL`). */
	license: string;
	reason: string;
	severity?: SemverRuleSeverity;
}

export interface SourceConstraintEntry {
	/** Dependency specifier prefix or regex (`git+`, `http:`, `file:`). */
	pattern: string;
	reason: string;
	severity?: SemverRuleSeverity;
}

export interface PolicyEndpointProbe {
	/** Absolute URL to probe (`/meta`, `/health`, etc.). */
	url: string;
	label?: string;
	method?: 'GET' | 'HEAD';
	expectStatus?: number;
	requireHeaders?: string[];
}

export interface PolicyIntelConfig {
	endpoints?: PolicyEndpointProbe[];
}

export interface PolicyConstraintsConfig {
	/** When true, only packages matching `[[constraints.allow]]` may be installed. */
	strictAllowlist?: boolean;
	/** When true, scan all of node_modules (transitive), not only package.json deps. */
	scanTransitive?: boolean;
	/** When true, only licenses matching `[[constraints.allowLicense]]` are permitted. */
	strictLicenseAllowlist?: boolean;
	allow?: ConstraintListEntry[];
	block?: ConstraintListEntry[];
	require?: RequiredPackageConstraint[];
	blockImport?: ImportConstraintEntry[];
	blockLicense?: LicenseConstraintEntry[];
	allowLicense?: LicenseConstraintEntry[];
	blockSource?: SourceConstraintEntry[];
}

export interface PolicyDocument {
	/** Default severity buckets for threat categories. */
	default?: PolicyDefault;
	/** Override rules applied in order. */
	override?: PolicyRule[];
	/** Snapshot baseline drift thresholds. */
	snapshot?: PolicySnapshotConfig;
	/** Version-aware vulnerability rules (`[[semver.rule]]`). */
	semver?: PolicySemverConfig;
	/** Source-code pattern rules (`[[patterns.regex]]`, `[[patterns.ast]]`). */
	patterns?: PolicyPatternsConfig;
	/** Package allow/block/require lists (`[constraints]`, `[[constraints.*]]`). */
	constraints?: PolicyConstraintsConfig;
	/** HTTP endpoint meta probes (`[[intel.endpoints]]`). */
	intel?: PolicyIntelConfig;
}

export interface PolicyResult {
	/** Advisories that survived the policy filter. */
	filtered: Bun.Security.Advisory[];
	/** Number of advisories ignored by policy rules. */
	ignored: number;
	/** Number of advisories escalated by policy rules. */
	escalated: number;
	/** Number of advisories downgraded by policy rules. */
	downgraded: number;
}
