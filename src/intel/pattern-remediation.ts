import path from 'path';
import type {PolicyDocument} from '../policy/types.ts';
import {patternRemediationHintFromPolicy} from '../policy/patterns.ts';
import {loadProjectPolicies} from '../policy/loader.ts';
import type {PatternMatch} from '../scan/patterns/index.ts';

export type PatternFixKind = 'manual' | 'env-var';

export interface PatternRemediationSuggestion {
	hint: string;
	example?: string;
	fixKind: PatternFixKind;
	/** Suggested env var when `fixKind` is `env-var`. */
	envVar?: string;
	autoFixable: boolean;
}

export interface PatternMatchWithRemediation extends PatternMatch {
	remediation?: PatternRemediationSuggestion;
}

export interface PatternScanReport {
	domain?: string;
	root: string;
	path: string;
	matches: PatternMatchWithRemediation[];
}

const REMEDIATION_CATALOG: Record<
	string,
	Omit<PatternRemediationSuggestion, 'hint'> & {hint: string}
> = {
	'hardcoded-secret': {
		hint: 'Move secrets to environment variables or Bun.secrets — never commit literals.',
		example: 'const token = process.env.API_TOKEN ?? "";',
		fixKind: 'env-var',
		envVar: 'API_TOKEN',
		autoFixable: true,
	},
	'unsafe-eval': {
		hint: 'Remove eval() and the Function constructor; use JSON.parse or static module loading.',
		fixKind: 'manual',
		autoFixable: false,
	},
	'unsafe-eval-ast': {
		hint: 'Replace eval() with safe parsing or validated static code paths.',
		fixKind: 'manual',
		autoFixable: false,
	},
	'obfuscated-code': {
		hint: 'Decode obfuscated strings at build time or replace with readable source.',
		fixKind: 'manual',
		autoFixable: false,
	},
	'process-env-access': {
		hint: 'Load sensitive values via Bun.secrets or your domain vault instead of raw process.env.',
		example: 'const key = await Bun.secrets.get("API_KEY");',
		fixKind: 'manual',
		autoFixable: false,
	},
};

function inferEnvVar(match: PatternMatch): string {
	const snippet = match.snippet ?? '';
	const nameMatch = snippet.match(/\b(api[_-]?key|token|secret|password)\b/i);
	if (nameMatch) {
		return nameMatch[1]!.replace(/[-]/g, '_').toUpperCase();
	}
	return 'API_TOKEN';
}

/** Resolve remediation guidance for a pattern match (policy override > catalog). */
export function suggestPatternRemediation(
	match: PatternMatch,
	policy?: PolicyDocument | null,
): PatternRemediationSuggestion {
	const policyHint = patternRemediationHintFromPolicy(policy, match.ruleId);
	const catalog = REMEDIATION_CATALOG[match.ruleId];
	const base = catalog ?? {
		hint: 'Review and fix the flagged source pattern manually.',
		fixKind: 'manual' as const,
		autoFixable: false,
	};

	const hint = policyHint ?? base.hint;
	const envVar = base.fixKind === 'env-var' ? (base.envVar ?? inferEnvVar(match)) : undefined;

	return {
		hint,
		example: base.example,
		fixKind: base.fixKind,
		envVar,
		autoFixable: base.autoFixable && base.fixKind === 'env-var',
	};
}

/** Attach remediation suggestions to pattern scan results. */
export function enrichPatternMatches(
	matches: PatternMatch[],
	policy?: PolicyDocument | null,
): PatternMatchWithRemediation[] {
	return matches.map(match => ({
		...match,
		remediation: suggestPatternRemediation(match, policy),
	}));
}

/** Build a pattern scan report with optional remediation enrichment. */
export async function buildPatternScanReport(
	matches: PatternMatch[],
	options: {
		root: string;
		path: string;
		domain?: string;
		includeRemediation?: boolean;
		policy?: PolicyDocument | null;
	},
): Promise<PatternScanReport> {
	const policy =
		options.policy ??
		(options.includeRemediation !== false ? await loadProjectPolicies(options.root) : null);

	return {
		domain: options.domain,
		root: options.root,
		path: options.path,
		matches:
			options.includeRemediation !== false
				? enrichPatternMatches(matches, policy)
				: matches.map(match => ({...match})),
	};
}

export function formatPatternRemediationLine(match: PatternMatchWithRemediation): string {
	const base = `${match.ruleId} ${match.file}:${match.line}:${match.column} — ${match.message}`;
	const remediation = match.remediation;
	if (!remediation) {
		return base;
	}
	const lines = [base, `   → ${remediation.hint}`];
	if (remediation.example) {
		lines.push(`   → Example: ${remediation.example}`);
	}
	if (remediation.autoFixable && remediation.envVar) {
		lines.push(`   → Auto-fix: replace literal with process.env.${remediation.envVar}`);
	}
	return lines.join('\n');
}

/** Apply a conservative auto-fix for env-var pattern violations (hardcoded secrets). */
export async function applyPatternFix(
	root: string,
	match: PatternMatchWithRemediation,
): Promise<{ok: boolean; message: string}> {
	const remediation = match.remediation;
	if (!remediation?.autoFixable || remediation.fixKind !== 'env-var') {
		return {ok: false, message: `${match.ruleId} requires manual remediation`};
	}

	const filePath = path.isAbsolute(match.file) ? match.file : path.join(root, match.file);
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		return {ok: false, message: `File not found: ${filePath}`};
	}

	const content = await file.text();
	const lines = content.split('\n');
	const lineIdx = match.line - 1;
	if (lineIdx < 0 || lineIdx >= lines.length) {
		return {ok: false, message: `Line ${match.line} not found in ${filePath}`};
	}

	const envVar = remediation.envVar ?? inferEnvVar(match);
	const line = lines[lineIdx]!;

	const newLine = line.replace(
		/(\w+)\s*=\s*['"][^'"]{8,}['"]/,
		(_match, name: string) => `${name} = process.env.${envVar} ?? ""`,
	);
	if (newLine === line) {
		return {ok: false, message: 'No matching literal assignment on flagged line'};
	}

	lines[lineIdx] = newLine;
	await Bun.write(filePath, lines.join('\n'));
	return {ok: true, message: `Updated ${filePath}:${match.line} → process.env.${envVar}`};
}

/** Apply all auto-fixable pattern remediations from a scan report. */
export async function applyPatternFixes(
	root: string,
	matches: readonly PatternMatchWithRemediation[],
): Promise<{ok: boolean; results: {ruleId: string; file: string; ok: boolean; message: string}[]}> {
	const results: {ruleId: string; file: string; ok: boolean; message: string}[] = [];
	const seen = new Set<string>();

	for (const match of matches) {
		if (!match.remediation?.autoFixable) continue;
		const key = `${match.ruleId}:${match.file}:${match.line}`;
		if (seen.has(key)) continue;
		seen.add(key);

		const result = await applyPatternFix(root, match);
		results.push({
			ruleId: match.ruleId,
			file: match.file,
			ok: result.ok,
			message: result.message,
		});
	}

	return {ok: results.length > 0 && results.every(entry => entry.ok), results};
}
