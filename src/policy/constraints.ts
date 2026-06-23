import type {
	ConstraintListEntry,
	ImportConstraintEntry,
	LicenseConstraintEntry,
	PolicyConstraintsConfig,
	PolicyDocument,
	RequiredPackageConstraint,
	SemverRuleSeverity,
	SourceConstraintEntry,
} from './types.ts';
import type {TranspilerRule} from '../scan/transpiler/types.ts';

function normalizeSeverity(value: unknown): SemverRuleSeverity {
	if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
		return value;
	}
	if (value === 'fatal') return 'critical';
	if (value === 'warn' || value === 'warning') return 'medium';
	return 'medium';
}

function parseStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const items = value.filter((item): item is string => typeof item === 'string');
	return items.length > 0 ? items : undefined;
}

function parseRuleBucket(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(entry): entry is Record<string, unknown> =>
			typeof entry === 'object' && entry !== null && !Array.isArray(entry),
	);
}

function parseListEntry(entry: Record<string, unknown>): ConstraintListEntry | null {
	const pkg = typeof entry.package === 'string' ? entry.package : undefined;
	const reason = typeof entry.reason === 'string' ? entry.reason : undefined;
	if (!pkg || !reason) return null;
	return {
		package: pkg,
		reason,
		severity: normalizeSeverity(entry.severity),
	};
}

function parseRequireEntry(entry: Record<string, unknown>): RequiredPackageConstraint | null {
	const pkg = typeof entry.package === 'string' ? entry.package : undefined;
	const reason = typeof entry.reason === 'string' ? entry.reason : undefined;
	if (!pkg || !reason) return null;
	return {
		package: pkg,
		reason,
		range: typeof entry.range === 'string' ? entry.range : undefined,
	};
}

function parseImportEntry(entry: Record<string, unknown>): ImportConstraintEntry | null {
	const pattern = typeof entry.pattern === 'string' ? entry.pattern : undefined;
	const reason = typeof entry.reason === 'string' ? entry.reason : undefined;
	if (!pattern || !reason) return null;
	return {
		pattern,
		reason,
		severity: normalizeSeverity(entry.severity),
		fileGlob: parseStringArray(entry.fileGlob),
	};
}

function parseLicenseEntry(entry: Record<string, unknown>): LicenseConstraintEntry | null {
	const license = typeof entry.license === 'string' ? entry.license : undefined;
	const reason = typeof entry.reason === 'string' ? entry.reason : undefined;
	if (!license || !reason) return null;
	return {
		license,
		reason,
		severity: normalizeSeverity(entry.severity),
	};
}

function parseSourceEntry(entry: Record<string, unknown>): SourceConstraintEntry | null {
	const pattern = typeof entry.pattern === 'string' ? entry.pattern : undefined;
	const reason = typeof entry.reason === 'string' ? entry.reason : undefined;
	if (!pattern || !reason) return null;
	return {
		pattern,
		reason,
		severity: normalizeSeverity(entry.severity),
	};
}

/** Convert a package glob (`lodash`, `@scope/*`) to a anchored RegExp. */
export function packageGlobToRegex(pattern: string): RegExp {
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '.*')
		.replace(/\?/g, '.');
	return new RegExp(`^${escaped}$`);
}

/** True when `packageName` matches a policy package glob. */
export function matchesPackageGlob(packageName: string, pattern: string): boolean {
	return packageGlobToRegex(pattern).test(packageName);
}

/** True when a license string matches a policy license entry (SPDX id substring). */
export function matchesLicenseToken(license: string, token: string): boolean {
	const normalized = license.toUpperCase();
	const needle = token.toUpperCase();
	return normalized === needle || normalized.includes(needle);
}

/** True when a dependency specifier matches a blocked source pattern. */
export function matchesSourcePattern(specifier: string, pattern: string): boolean {
	if (pattern.startsWith('/') && pattern.endsWith('/')) {
		return new RegExp(pattern.slice(1, -1)).test(specifier);
	}
	return specifier.startsWith(pattern) || specifier.includes(pattern);
}

/** Extract `[constraints]` from a parsed TOML document. */
export function extractConstraintsConfigFromToml(parsed: unknown): PolicyConstraintsConfig {
	if (typeof parsed !== 'object' || parsed === null) {
		return {};
	}

	const constraints = (parsed as Record<string, unknown>).constraints;
	if (typeof constraints !== 'object' || constraints === null) {
		return {};
	}

	const section = constraints as Record<string, unknown>;
	const allow = parseRuleBucket(section.allow)
		.map(parseListEntry)
		.filter((entry): entry is ConstraintListEntry => entry !== null);
	const block = parseRuleBucket(section.block)
		.map(parseListEntry)
		.filter((entry): entry is ConstraintListEntry => entry !== null);
	const require = parseRuleBucket(section.require)
		.map(parseRequireEntry)
		.filter((entry): entry is RequiredPackageConstraint => entry !== null);
	const blockImport = parseRuleBucket(section.blockImport)
		.map(parseImportEntry)
		.filter((entry): entry is ImportConstraintEntry => entry !== null);
	const blockLicense = parseRuleBucket(section.blockLicense)
		.map(parseLicenseEntry)
		.filter((entry): entry is LicenseConstraintEntry => entry !== null);
	const allowLicense = parseRuleBucket(section.allowLicense)
		.map(parseLicenseEntry)
		.filter((entry): entry is LicenseConstraintEntry => entry !== null);
	const blockSource = parseRuleBucket(section.blockSource)
		.map(parseSourceEntry)
		.filter((entry): entry is SourceConstraintEntry => entry !== null);

	return {
		strictAllowlist: section.strictAllowlist === true ? true : undefined,
		scanTransitive: section.scanTransitive === true ? true : undefined,
		strictLicenseAllowlist: section.strictLicenseAllowlist === true ? true : undefined,
		allow: allow.length > 0 ? allow : undefined,
		block: block.length > 0 ? block : undefined,
		require: require.length > 0 ? require : undefined,
		blockImport: blockImport.length > 0 ? blockImport : undefined,
		blockLicense: blockLicense.length > 0 ? blockLicense : undefined,
		allowLicense: allowLicense.length > 0 ? allowLicense : undefined,
		blockSource: blockSource.length > 0 ? blockSource : undefined,
	};
}

export function constraintsFromDocument(
	doc: PolicyDocument | null | undefined,
): PolicyConstraintsConfig {
	return doc?.constraints ?? {};
}

export function hasPolicyConstraints(config: PolicyConstraintsConfig): boolean {
	return (
		config.strictAllowlist === true ||
		config.scanTransitive === true ||
		config.strictLicenseAllowlist === true ||
		(config.allow?.length ?? 0) > 0 ||
		(config.block?.length ?? 0) > 0 ||
		(config.require?.length ?? 0) > 0 ||
		(config.blockImport?.length ?? 0) > 0 ||
		(config.blockLicense?.length ?? 0) > 0 ||
		(config.allowLicense?.length ?? 0) > 0 ||
		(config.blockSource?.length ?? 0) > 0
	);
}

/** True when a package matches any `[[constraints.allow]]` glob. */
export function isPackageConstraintAllowed(
	packageName: string,
	config: PolicyConstraintsConfig,
): boolean {
	return (config.allow ?? []).some(entry => matchesPackageGlob(packageName, entry.package));
}

/** True when a license matches any `[[constraints.allowLicense]]` entry. */
export function isLicenseConstraintAllowed(
	license: string,
	config: PolicyConstraintsConfig,
): boolean {
	return (config.allowLicense ?? []).some(entry => matchesLicenseToken(license, entry.license));
}

/** First matching block entry for a package, if any. */
export function matchingBlockConstraint(
	packageName: string,
	config: PolicyConstraintsConfig,
): ConstraintListEntry | undefined {
	return (config.block ?? []).find(entry => matchesPackageGlob(packageName, entry.package));
}

/** Map `[[constraints.blockImport]]` to transpiler import rules. */
export function importConstraintRules(config: PolicyConstraintsConfig): TranspilerRule[] {
	return (config.blockImport ?? []).map(entry => ({
		id: `constraint-import:${entry.pattern}`,
		description: entry.reason,
		severity: entry.severity ?? 'high',
		type: 'import' as const,
		importPattern: entry.pattern,
	}));
}