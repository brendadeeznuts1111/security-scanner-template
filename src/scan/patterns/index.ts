import path from 'path';
import {statSync} from 'fs';
import type {ASTPatternRule, PolicyDocument, RegexPatternRule} from '../../policy/types.ts';
import {ASTMatcher} from './ast-matcher.ts';
import {parseSourceAst} from './ast-parser.ts';
import {matchRegexPattern} from './regex-matcher.ts';

export type {ASTNode} from './ast-matcher.ts';
export {ASTMatcher} from './ast-matcher.ts';
export {buildAstFromSource, parseSourceAst, isAstScannablePath} from './ast-parser.ts';
export {matchRegexPattern} from './regex-matcher.ts';

export type PatternSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface PatternMatch {
	ruleId: string;
	file: string;
	line: number;
	column: number;
	severity: PatternSeverity;
	message: string;
	snippet?: string;
}

type PatternRule = RegexPatternRule | ASTPatternRule;

const DEFAULT_GLOB = '**/*';

function collectGlobs(rules: PatternRule[]): string[] {
	const globs = new Set<string>();
	for (const rule of rules) {
		if (rule.fileGlob) {
			for (const glob of rule.fileGlob) {
				globs.add(glob);
			}
		} else {
			globs.add(DEFAULT_GLOB);
		}
	}
	return Array.from(globs);
}

function matchesGlob(relativePath: string, globs?: string[]): boolean {
	if (!globs || globs.length === 0) return true;
	for (const glob of globs) {
		if (new Bun.Glob(glob).match(relativePath)) {
			return true;
		}
	}
	return false;
}

async function resolveFiles(scanRoot: string, globs: string[]): Promise<string[]> {
	const files = new Set<string>();

	for (const glob of globs) {
		const bunGlob = new Bun.Glob(glob);
		for await (const match of bunGlob.scan({cwd: scanRoot, onlyFiles: true})) {
			files.add(path.join(scanRoot, match));
		}
	}

	return Array.from(files).sort();
}

function extractSnippet(content: string, line: number, column: number, radius = 60): string {
	const lines = content.split('\n');
	const row = lines[line - 1];
	if (!row) return '';
	const start = Math.max(0, column - 1);
	const slice = row
		.slice(start, start + radius)
		.replace(/\s+/g, ' ')
		.trim();
	return slice || row.trim();
}

function dedupeKey(match: PatternMatch): string {
	return `${match.ruleId}:${match.file}:${match.line}:${match.column}`;
}

export class PatternScanner {
	private readonly policy: PolicyDocument;
	private readonly transpiler: Bun.Transpiler;

	constructor(policy: PolicyDocument) {
		this.policy = policy;
		this.transpiler = new Bun.Transpiler({});
	}

	/** Scan a directory for regex and AST pattern violations from policy. */
	async scanDirectory(dir: string): Promise<PatternMatch[]> {
		const regexRules = this.policy.patterns?.regex ?? [];
		const astRules = this.policy.patterns?.ast ?? [];
		if (regexRules.length === 0 && astRules.length === 0) {
			return [];
		}

		const scanRoot = path.resolve(dir);
		let stat: ReturnType<typeof statSync> | undefined;
		try {
			stat = statSync(scanRoot);
		} catch {
			return [];
		}

		const allRules: PatternRule[] = [...regexRules, ...astRules];
		const files = stat.isFile() ? [scanRoot] : await resolveFiles(scanRoot, collectGlobs(allRules));
		const merged = new Map<string, PatternMatch>();

		for (const file of files) {
			const relativePath = stat.isFile() ? path.basename(file) : path.relative(scanRoot, file);
			const content = await Bun.file(file).text();

			for (const rule of regexRules) {
				if (!matchesGlob(relativePath, rule.fileGlob)) continue;
				for (const hit of matchRegexPattern(content, rule.pattern)) {
					const match: PatternMatch = {
						ruleId: rule.id,
						file,
						line: hit.line,
						column: hit.column,
						severity: rule.severity,
						message: rule.description,
						snippet: hit.snippet,
					};
					merged.set(dedupeKey(match), match);
				}
			}

			if (astRules.length === 0) continue;

			const ast = await this.parseAST(content, file);
			if (!ast) continue;

			for (const rule of astRules) {
				if (!matchesGlob(relativePath, rule.fileGlob)) continue;
				const nodes = ASTMatcher.findNodes(ast, rule.astPattern);
				for (const node of nodes) {
					const loc = node.loc?.start ?? {line: 0, column: 0};
					const match: PatternMatch = {
						ruleId: rule.id,
						file,
						line: loc.line,
						column: loc.column,
						severity: rule.severity,
						message: rule.description,
						snippet: extractSnippet(content, loc.line, loc.column),
					};
					merged.set(dedupeKey(match), match);
				}
			}
		}

		return Array.from(merged.values()).sort((a, b) =>
			a.file === b.file
				? a.line === b.line
					? a.column - b.column
					: a.line - b.line
				: a.file.localeCompare(b.file),
		);
	}

	private async parseAST(
		content: string,
		file: string,
	): Promise<import('./ast-matcher.ts').ASTNode | null> {
		const nativeParse = (this.transpiler as {parse?: (source: string) => unknown}).parse;
		if (typeof nativeParse === 'function') {
			try {
				const ast = nativeParse.call(this.transpiler, content);
				if (ast && typeof ast === 'object' && 'type' in (ast as object)) {
					return ast as import('./ast-matcher.ts').ASTNode;
				}
			} catch {
				// Fall through to source extractor.
			}
		}
		return parseSourceAst(content, file);
	}
}
