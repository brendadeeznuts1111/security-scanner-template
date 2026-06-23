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

export interface PolicyDocument {
	/** Default severity buckets for threat categories. */
	default?: PolicyDefault;
	/** Override rules applied in order. */
	override?: PolicyRule[];
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
