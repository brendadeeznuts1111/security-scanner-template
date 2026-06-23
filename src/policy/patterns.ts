import type {
	ASTPatternRule,
	PolicyDocument,
	PolicyPatternsConfig,
	PatternRuleSeverity,
	RegexPatternRule,
} from './types.ts';
import type {TranspilerRule} from '../scan/transpiler/types.ts';

function normalizeSeverity(value: unknown): PatternRuleSeverity {
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

function parseRegexEntry(entry: Record<string, unknown>): RegexPatternRule | null {
	const id = typeof entry.id === 'string' ? entry.id : undefined;
	const pattern = typeof entry.pattern === 'string' ? entry.pattern : undefined;
	if (!id || !pattern) return null;

	return {
		id,
		pattern,
		severity: normalizeSeverity(entry.severity),
		description: typeof entry.description === 'string' ? entry.description : id,
		fileGlob: parseStringArray(entry.fileGlob),
		remediation: typeof entry.remediation === 'string' ? entry.remediation : undefined,
	};
}

function parseAstEntry(entry: Record<string, unknown>): ASTPatternRule | null {
	const id = typeof entry.id === 'string' ? entry.id : undefined;
	const astPattern = typeof entry.astPattern === 'string' ? entry.astPattern : undefined;
	if (!id || !astPattern) return null;

	return {
		id,
		astPattern,
		severity: normalizeSeverity(entry.severity),
		description: typeof entry.description === 'string' ? entry.description : id,
		fileGlob: parseStringArray(entry.fileGlob),
		remediation: typeof entry.remediation === 'string' ? entry.remediation : undefined,
	};
}

/** Lookup policy remediation hint by pattern rule id. */
export function patternRemediationHintFromPolicy(
	doc: PolicyDocument | null | undefined,
	ruleId: string,
): string | undefined {
	for (const rule of doc?.patterns?.regex ?? []) {
		if (rule.id === ruleId && rule.remediation) return rule.remediation;
	}
	for (const rule of doc?.patterns?.ast ?? []) {
		if (rule.id === ruleId && rule.remediation) return rule.remediation;
	}
	return undefined;
}

function parseRuleBucket(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(entry): entry is Record<string, unknown> =>
			typeof entry === 'object' && entry !== null && !Array.isArray(entry),
	);
}

/** Convert a CSS-selector-style AST pattern to a regex for transpiler-backed scanning. */
export function astPatternToRegex(astPattern: string): string {
	const memberMatch = astPattern.match(/CallExpression\[callee\.name='([^']+)'\]/);
	if (memberMatch) {
		const name = memberMatch[1] ?? '';
		if (name.includes('.')) {
			return `${name.replace(/\./g, '\\.')}\\s*\\(`;
		}
		return `\\b${name}\\s*\\(`;
	}

	const chainedMatch = astPattern.match(
		/CallExpression\[callee\.object\.name='([^']+)'\]\[callee\.property\.name='([^']+)'\]/,
	);
	if (chainedMatch) {
		const object = chainedMatch[1] ?? '';
		const property = chainedMatch[2] ?? '';
		return `\\b${object}\\.${property}\\s*\\(`;
	}

	return astPattern;
}

/** Extract `[[patterns.regex]]` and `[[patterns.ast]]` from a parsed TOML document. */
export function extractPatternsConfigFromToml(parsed: unknown): PolicyPatternsConfig {
	if (typeof parsed !== 'object' || parsed === null) {
		return {};
	}

	const patterns = (parsed as Record<string, unknown>).patterns;
	if (typeof patterns !== 'object' || patterns === null) {
		return {};
	}

	const section = patterns as Record<string, unknown>;
	const regex = parseRuleBucket(section.regex)
		.map(parseRegexEntry)
		.filter((rule): rule is RegexPatternRule => rule !== null);
	const ast = parseRuleBucket(section.ast)
		.map(parseAstEntry)
		.filter((rule): rule is ASTPatternRule => rule !== null);

	return {
		regex: regex.length > 0 ? regex : undefined,
		ast: ast.length > 0 ? ast : undefined,
	};
}

export function patternsFromDocument(doc: PolicyDocument | null | undefined): PolicyPatternsConfig {
	return doc?.patterns ?? {};
}

export function hasPatternRules(config: PolicyPatternsConfig): boolean {
	return (config.regex?.length ?? 0) > 0 || (config.ast?.length ?? 0) > 0;
}

/** Map policy pattern rules to transpiler rules for `scanSourceWithRules`. */
export function patternRulesToTranspilerRules(config: PolicyPatternsConfig): TranspilerRule[] {
	const rules: TranspilerRule[] = [];

	for (const entry of config.regex ?? []) {
		rules.push({
			id: entry.id,
			description: entry.description,
			severity: entry.severity,
			type: 'regex',
			pattern: entry.pattern,
		});
	}

	for (const entry of config.ast ?? []) {
		rules.push({
			id: entry.id,
			description: entry.description,
			severity: entry.severity,
			type: 'ast',
			pattern: astPatternToRegex(entry.astPattern),
		});
	}

	return rules;
}
