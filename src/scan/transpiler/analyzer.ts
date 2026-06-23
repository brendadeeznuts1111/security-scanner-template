import type {TranspilerRule, TranspilerScanResult} from './types.ts';

const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);

export function isScannableSourcePath(filePath: string): boolean {
	const dot = filePath.lastIndexOf('.');
	if (dot < 0) return false;
	return SCAN_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
}

function detectLoader(source: string, filePath?: string): 'js' | 'ts' | 'tsx' {
	if (filePath?.endsWith('.tsx') || filePath?.endsWith('.jsx')) return 'tsx';
	if (filePath?.endsWith('.ts')) return 'ts';
	if (/^\s*</.test(source)) return 'tsx';
	if (/\binterface\b|\btype\b|:\s*\w+/.test(source)) return 'ts';
	return 'js';
}

function lineNumberAt(source: string, index: number): number {
	return source.slice(0, index).split('\n').length;
}

function columnAt(source: string, index: number): number {
	const lineStart = source.lastIndexOf('\n', index) + 1;
	return index - lineStart + 1;
}

function snippetAt(source: string, index: number, radius = 40): string {
	const start = Math.max(0, index - radius);
	const end = Math.min(source.length, index + radius);
	return source.slice(start, end).replace(/\s+/g, ' ').trim();
}

function transpileSource(source: string, loader: 'js' | 'ts' | 'tsx'): string {
	const transpiler = new Bun.Transpiler({loader});
	try {
		return transpiler.transformSync(source);
	} catch {
		return source;
	}
}

const IMPORT_PATTERNS = [
	/\bimport\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g,
	/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
	/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function scanImports(
	source: string,
	file: string,
	rules: TranspilerRule[],
): TranspilerScanResult[] {
	const findings: TranspilerScanResult[] = [];
	const importRules = rules.filter(rule => rule.type === 'import' && rule.importPattern);

	for (const rule of importRules) {
		const needle = rule.importPattern!;
		for (const pattern of IMPORT_PATTERNS) {
			pattern.lastIndex = 0;
			let match: RegExpExecArray | null;
			while ((match = pattern.exec(source)) !== null) {
				const specifier = match[1] ?? '';
				if (!specifier.includes(needle)) continue;
				findings.push({
					type: 'transpiler',
					file,
					line: lineNumberAt(source, match.index),
					column: columnAt(source, match.index),
					ruleId: rule.id,
					severity: rule.severity,
					message: rule.description,
					snippet: snippetAt(source, match.index),
					category: rule.category,
				});
			}
		}
	}

	return findings;
}

function scanRegexRules(
	source: string,
	file: string,
	rules: TranspilerRule[],
): TranspilerScanResult[] {
	const findings: TranspilerScanResult[] = [];

	for (const rule of rules) {
		if (rule.type !== 'regex' && rule.type !== 'ast') continue;
		if (!rule.pattern) continue;

		const regex = new RegExp(rule.pattern, 'g');
		let match: RegExpExecArray | null;
		while ((match = regex.exec(source)) !== null) {
			findings.push({
				type: 'transpiler',
				file,
				line: lineNumberAt(source, match.index),
				column: columnAt(source, match.index),
				ruleId: rule.id,
				severity: rule.severity,
				message: rule.description,
				snippet: snippetAt(source, match.index),
				category: rule.category,
			});
		}
	}

	return findings;
}

/**
 * Scan source against transpiler rules (regex, pseudo-AST patterns, imports).
 * Bun.Transpiler has no public AST walker — we scan original + transpiled output.
 */
export function scanSourceWithRules(
	source: string,
	file: string,
	rules: TranspilerRule[],
	options: {loader?: 'js' | 'ts' | 'tsx'} = {},
): TranspilerScanResult[] {
	const loader = options.loader ?? detectLoader(source, file);
	const transformed = transpileSource(source, loader);
	const merged = new Map<string, TranspilerScanResult>();

	for (const finding of [
		...scanRegexRules(source, file, rules),
		...scanRegexRules(transformed, file, rules),
		...scanImports(source, file, rules),
		...scanImports(transformed, file, rules),
	]) {
		const key = `${finding.ruleId}:${finding.line ?? 0}:${finding.column ?? 0}`;
		merged.set(key, finding);
	}

	return Array.from(merged.values());
}

/** Alias for spec compatibility — AST walk is regex + transpile-backed. */
export function scanAST(
	source: string,
	file: string,
	rules: TranspilerRule[],
	options: {loader?: 'js' | 'ts' | 'tsx'} = {},
): TranspilerScanResult[] {
	return scanSourceWithRules(source, file, rules, options);
}
