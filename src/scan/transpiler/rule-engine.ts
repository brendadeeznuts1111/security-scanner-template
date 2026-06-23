import path from 'path';
import {parseToml} from '../../config/toml.ts';
import type {TranspilerRule, TranspilerSeverity} from './types.ts';

export const DEFAULT_TRANSPILER_RULES: TranspilerRule[] = [
	{
		id: 'unsafe-eval',
		description: 'Detects use of eval()',
		severity: 'critical',
		type: 'ast',
		pattern: String.raw`\beval\s*\(`,
		category: 'backdoor',
	},
	{
		id: 'function-constructor',
		description: 'Detects Function constructor',
		severity: 'critical',
		type: 'ast',
		pattern: String.raw`new\s+Function\s*\(`,
		category: 'backdoor',
	},
	{
		id: 'hardcoded-secret',
		description: 'Detects hardcoded API keys or tokens',
		severity: 'high',
		type: 'regex',
		pattern: String.raw`(?:api[_-]?key|token|secret|password)\s*=\s*['"][^'"]{16,}['"]`,
		category: 'token-stealer',
	},
	{
		id: 'string-from-char-code',
		description: 'Obfuscated string construction',
		severity: 'medium',
		type: 'regex',
		pattern: String.raw`String\.fromCharCode\s*\(`,
		category: 'malware',
	},
	{
		id: 'child-process',
		description: 'Spawns child processes',
		severity: 'high',
		type: 'import',
		importPattern: 'child_process',
		category: 'backdoor',
	},
	{
		id: 'remote-import',
		description: 'Dynamic import with non-literal specifier',
		severity: 'medium',
		type: 'regex',
		pattern: String.raw`import\s*\(\s*[^'"\s][^)]*\)`,
		category: 'malware',
	},
	{
		id: 'set-timeout-string',
		description: 'setTimeout with string argument',
		severity: 'high',
		type: 'regex',
		pattern: String.raw`setTimeout\s*\(\s*['"]`,
		category: 'backdoor',
	},
];

function normalizeSeverity(value: unknown): TranspilerSeverity {
	if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
		return value;
	}
	if (value === 'fatal') return 'critical';
	if (value === 'warn' || value === 'warning') return 'medium';
	return 'medium';
}

function parseRuleEntry(entry: Record<string, unknown>): TranspilerRule | null {
	const id = typeof entry.id === 'string' ? entry.id : undefined;
	if (!id) return null;

	return {
		id,
		description: typeof entry.description === 'string' ? entry.description : id,
		severity: normalizeSeverity(entry.severity),
		type:
			entry.type === 'regex' || entry.type === 'ast' || entry.type === 'import'
				? entry.type
				: entry.astPattern
					? 'ast'
					: entry.importPattern
						? 'import'
						: 'regex',
		pattern:
			typeof entry.pattern === 'string'
				? entry.pattern
				: typeof entry.astPattern === 'string'
					? entry.astPattern
					: undefined,
		importPattern: typeof entry.importPattern === 'string' ? entry.importPattern : undefined,
		category: typeof entry.category === 'string' ? entry.category : undefined,
	};
}

function extractRulesFromToml(parsed: unknown): TranspilerRule[] {
	if (typeof parsed !== 'object' || parsed === null) {
		return [];
	}

	const doc = parsed as Record<string, unknown>;
	const buckets: unknown[] = [];

	if (Array.isArray(doc.rule)) {
		buckets.push(...doc.rule);
	}
	const transpiler = doc.transpiler;
	if (typeof transpiler === 'object' && transpiler !== null) {
		const rules = (transpiler as Record<string, unknown>).rule;
		if (Array.isArray(rules)) {
			buckets.push(...rules);
		}
	}

	return buckets
		.map(entry =>
			typeof entry === 'object' && entry !== null
				? parseRuleEntry(entry as Record<string, unknown>)
				: null,
		)
		.filter((rule): rule is TranspilerRule => rule !== null);
}

/** Load transpiler rules from a TOML policy file. */
export async function loadTranspilerRules(filePath: string): Promise<TranspilerRule[]> {
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		return [];
	}
	const parsed = parseToml(await file.text());
	return extractRulesFromToml(parsed);
}

/** Resolve rules by id filter, falling back to built-in defaults. */
export function resolveTranspilerRules(
	loaded: TranspilerRule[],
	ruleIds?: string[],
): TranspilerRule[] {
	const catalog = loaded.length > 0 ? loaded : DEFAULT_TRANSPILER_RULES;
	if (!ruleIds || ruleIds.length === 0) {
		return catalog;
	}
	const selected = catalog.filter(rule => ruleIds.includes(rule.id));
	return selected.length > 0 ? selected : catalog;
}

export async function loadProjectTranspilerRules(
	root: string = process.cwd(),
	rulesPath?: string,
): Promise<TranspilerRule[]> {
	const candidates = [
		rulesPath,
		path.join(root, 'transpiler-rules.toml'),
		path.join(root, 'security.policy.toml'),
		path.join(root, 'templates', 'transpiler-rules.toml'),
	].filter((candidate): candidate is string => Boolean(candidate));

	for (const candidate of candidates) {
		const rules = await loadTranspilerRules(candidate);
		if (rules.length > 0) {
			return rules;
		}
	}

	return DEFAULT_TRANSPILER_RULES;
}
