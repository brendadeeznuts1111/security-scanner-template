import type {PolicyDefault, PolicyDocument, PolicyResult, PolicyRule} from './types.ts';

function globToRegex(pattern: string): RegExp {
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '.*')
		.replace(/\?/g, '.');
	return new RegExp(`^${escaped}$`);
}

function matchesPackage(rule: PolicyRule, advisory: Bun.Security.Advisory): boolean {
	if (!rule.package) return true;
	const regex = globToRegex(rule.package);
	return regex.test(advisory.package);
}

function matchesVersion(rule: PolicyRule, advisory: Bun.Security.Advisory): boolean {
	if (!rule.version) return true;
	if (!advisory.version) return false;
	return Bun.semver.satisfies(advisory.version, rule.version);
}

function matchesCve(rule: PolicyRule, advisory: Bun.Security.Advisory): boolean {
	if (!rule.cve) return true;
	const cve = advisory.cve ?? '';
	if (cve.length === 0) return false;
	const regex = new RegExp(rule.cve);
	return regex.test(cve);
}

function matchesCategory(rule: PolicyRule, advisory: Bun.Security.Advisory): boolean {
	if (!rule.category) return true;
	return advisory.categories?.includes(rule.category) ?? false;
}

function ruleMatches(rule: PolicyRule, advisory: Bun.Security.Advisory): boolean {
	if (!matchesPackage(rule, advisory)) return false;
	if (!matchesVersion(rule, advisory)) return false;
	if (!matchesCve(rule, advisory)) return false;
	if (!matchesCategory(rule, advisory)) return false;
	return true;
}

function severityRank(level: string): number {
	return {fatal: 0, warn: 1, info: 2}[level] ?? 3;
}

function coerceSeverity(level: string): 'fatal' | 'warn' | 'info' {
	if (level === 'fatal' || level === 'warn' || level === 'info') return level;
	return 'warn';
}

function toAdvisoryLevel(level: 'fatal' | 'warn' | 'info'): 'fatal' | 'warn' {
	return level === 'info' ? 'warn' : level;
}

/**
 * Apply a set of policy rules to a list of advisories.
 *
 * Rules are evaluated in order. The first matching rule wins. Actions:
 * - `ignore`: drop the advisory from the result.
 * - `downgrade`: set the advisory level to `to` (defaults one step lower).
 * - `escalate`: set the advisory level to `to` (defaults one step higher).
 */
export function applyPolicy(
	advisories: Bun.Security.Advisory[],
	rules: PolicyRule[],
): PolicyResult {
	let ignored = 0;
	let escalated = 0;
	let downgraded = 0;

	const filtered = advisories.filter(advisory => {
		const rule = rules.find(r => ruleMatches(r, advisory));
		if (!rule) return true;

		if (rule.action === 'ignore') {
			ignored++;
			return false;
		}

		const current = coerceSeverity(advisory.level);
		const target = rule.to ?? (rule.action === 'escalate' ? 'fatal' : 'info');

		if (rule.action === 'escalate') {
			if (severityRank(target) < severityRank(current)) {
				advisory.level = toAdvisoryLevel(target);
				escalated++;
			}
		} else if (rule.action === 'downgrade') {
			if (severityRank(target) > severityRank(current)) {
				advisory.level = toAdvisoryLevel(target);
				downgraded++;
			}
		}

		return true;
	});

	return {filtered, ignored, escalated, downgraded};
}

/**
 * Derive a severity policy from a policy document's default section.
 * Returns the fatal/warn arrays expected by the provider policy module.
 */
export function severityPolicyFromDocument(doc: PolicyDocument): {
	fatal: string[];
	warn: string[];
} {
	return {
		fatal: doc.default?.fatal ?? ['backdoor', 'botnet', 'token-stealer', 'malware'],
		warn: doc.default?.warn ?? ['protestware', 'adware', 'deprecated', 'unmaintained'],
	};
}

/**
 * Merge multiple policy documents into one. Later documents override earlier
 * ones for defaults; override rules are concatenated in order.
 */
export function mergePolicies(docs: PolicyDocument[]): PolicyDocument {
	return docs.reduce((acc, doc) => {
		const mergedDefault: PolicyDefault = {};
		for (const key of ['fatal', 'warn', 'info'] as const) {
			mergedDefault[key] = doc.default?.[key] ?? acc.default?.[key];
		}
		return {
			default: mergedDefault,
			override: [...(acc.override ?? []), ...(doc.override ?? [])],
		};
	}, {} as PolicyDocument);
}
