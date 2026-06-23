import type {SemverRule, SemverRuleSeverity} from './types.ts';

function normalizeSeverity(value: unknown): SemverRuleSeverity {
	if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
		return value;
	}
	if (value === 'fatal') return 'critical';
	if (value === 'warn' || value === 'warning') return 'medium';
	return 'medium';
}

function parseSemverRuleEntry(entry: Record<string, unknown>): SemverRule | null {
	const id = typeof entry.id === 'string' ? entry.id : undefined;
	const pkg = typeof entry.package === 'string' ? entry.package : undefined;
	const range = typeof entry.range === 'string' ? entry.range : undefined;
	if (!id || !pkg || !range) return null;

	return {
		id,
		package: pkg,
		range,
		severity: normalizeSeverity(entry.severity),
		description: typeof entry.description === 'string' ? entry.description : id,
		category: typeof entry.category === 'string' ? entry.category : undefined,
		safeRange: typeof entry.safeRange === 'string' ? entry.safeRange : undefined,
	};
}

function recordFromSection(value: unknown): Record<string, string> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return {};
	}
	const out: Record<string, string> = {};
	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		if (typeof item === 'string') {
			out[key] = item;
		}
	}
	return out;
}

/** Extract `[[semver.rule]]` entries from a parsed TOML document. */
export function extractSemverRulesFromToml(parsed: unknown): SemverRule[] {
	if (typeof parsed !== 'object' || parsed === null) {
		return [];
	}

	const doc = parsed as Record<string, unknown>;
	const semver = doc.semver;
	if (typeof semver !== 'object' || semver === null) {
		return [];
	}

	const ruleBucket = (semver as Record<string, unknown>).rule;
	const entries = Array.isArray(ruleBucket) ? ruleBucket : [];
	return entries
		.map(entry =>
			typeof entry === 'object' && entry !== null
				? parseSemverRuleEntry(entry as Record<string, unknown>)
				: null,
		)
		.filter((rule): rule is SemverRule => rule !== null);
}

export function semverRulesFromDocument(
	doc: import('./types.ts').PolicyDocument | null | undefined,
): SemverRule[] {
	return doc?.semver?.rules ?? [];
}

export function semverConstraintsFromDocument(
	doc: import('./types.ts').PolicyDocument | null | undefined,
): {packages: Record<string, string>; blocked: Record<string, string>} {
	return {
		packages: doc?.semver?.packages ?? {},
		blocked: doc?.semver?.blocked ?? {},
	};
}

/** Extract `[semver.packages]`, `[semver.blocked]`, and `[[semver.rule]]` from TOML. */
export function extractSemverConfigFromToml(parsed: unknown): import('./types.ts').PolicySemverConfig {
	const rules = extractSemverRulesFromToml(parsed);
	if (typeof parsed !== 'object' || parsed === null) {
		return {rules};
	}
	const semver = (parsed as Record<string, unknown>).semver;
	if (typeof semver !== 'object' || semver === null) {
		return {rules};
	}
	const section = semver as Record<string, unknown>;
	const packages = recordFromSection(section.packages);
	const blocked = recordFromSection(section.blocked);
	return {
		rules,
		packages: Object.keys(packages).length > 0 ? packages : undefined,
		blocked: Object.keys(blocked).length > 0 ? blocked : undefined,
	};
}