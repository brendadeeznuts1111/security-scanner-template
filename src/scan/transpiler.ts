export type SourceSeverity = 'fatal' | 'warn';

export interface SourcePattern {
	id: string;
	pattern: RegExp;
	severity: SourceSeverity;
	description: string;
	category: 'backdoor' | 'malware' | 'token-stealer';
}

export interface SourceFinding {
	id: string;
	severity: SourceSeverity;
	description: string;
	category: SourcePattern['category'];
	line?: number;
}

export const DEFAULT_SOURCE_PATTERNS: SourcePattern[] = [
	{
		id: 'eval',
		pattern: /\beval\s*\(/,
		severity: 'fatal',
		description: 'Uses eval()',
		category: 'backdoor',
	},
	{
		id: 'function-constructor',
		pattern: /new\s+Function\s*\(/,
		severity: 'fatal',
		description: 'Uses Function constructor',
		category: 'backdoor',
	},
	{
		id: 'child-process',
		pattern: /child_process|require\(['"]node:child_process['"]\)/,
		severity: 'warn',
		description: 'Spawns child processes',
		category: 'backdoor',
	},
	{
		id: 'process-env-exfil',
		pattern: /process\.env\b.*(?:fetch|http|request|XMLHttpRequest)/,
		severity: 'fatal',
		description: 'May exfiltrate environment variables',
		category: 'token-stealer',
	},
	{
		id: 'dynamic-import-data',
		pattern: /import\s*\(\s*[^'"\s][^)]*\)/,
		severity: 'warn',
		description: 'Uses dynamic import with non-literal specifier',
		category: 'malware',
	},
];

function detectLoader(source: string): 'js' | 'ts' | 'tsx' {
	if (/^\s*</.test(source)) return 'tsx';
	if (/\binterface\b|\btype\b|:\s*\w+/.test(source)) return 'ts';
	return 'js';
}

function lineNumberAt(source: string, index: number): number {
	return source.slice(0, index).split('\n').length;
}

function scanText(source: string, patterns: SourcePattern[]): SourceFinding[] {
	const findings: SourceFinding[] = [];

	for (const pattern of patterns) {
		const match = pattern.pattern.exec(source);
		if (match) {
			findings.push({
				id: pattern.id,
				severity: pattern.severity,
				description: pattern.description,
				category: pattern.category,
				line: match.index !== undefined ? lineNumberAt(source, match.index) : undefined,
			});
		}
	}

	return findings;
}

export interface ScanBundleOptions {
	loader?: 'js' | 'ts' | 'tsx';
	patterns?: SourcePattern[];
}

export interface ScanBundleResult {
	path: string;
	findings: SourceFinding[];
	bytes: number;
}

/**
 * Scan a built bundle file (e.g. `bun build` output) for injected threats.
 */
export async function scanBundle(
	bundlePath: string,
	options: ScanBundleOptions = {},
): Promise<ScanBundleResult> {
	const file = Bun.file(bundlePath);
	if (!(await file.exists())) {
		throw new Error(`Bundle not found: ${bundlePath}`);
	}

	const source = await file.text();
	const findings = scanSource(source, {
		loader: options.loader ?? 'js',
		patterns: options.patterns,
	});

	return {
		path: bundlePath,
		findings,
		bytes: source.length,
	};
}

/**
 * Scan multiple bundle paths and merge findings by path.
 */
export async function scanBundles(
	bundlePaths: readonly string[],
	options: ScanBundleOptions = {},
): Promise<ScanBundleResult[]> {
	return Promise.all(bundlePaths.map(path => scanBundle(path, options)));
}

/**
 * Transpile and scan JavaScript/TypeScript source for suspicious patterns.
 */
export function scanSource(
	source: string,
	options: {loader?: 'js' | 'ts' | 'tsx'; patterns?: SourcePattern[]} = {},
): SourceFinding[] {
	const patterns = options.patterns ?? DEFAULT_SOURCE_PATTERNS;
	const loader = options.loader ?? detectLoader(source);
	const transpiler = new Bun.Transpiler({loader});

	let transformed = source;
	try {
		transformed = transpiler.transformSync(source);
	} catch {
		// Fall back to scanning the original source when transpilation fails.
	}

	const findings = new Map<string, SourceFinding>();
	for (const finding of [...scanText(source, patterns), ...scanText(transformed, patterns)]) {
		findings.set(finding.id, finding);
	}

	return Array.from(findings.values());
}

/**
 * Convert source findings into scanner advisories.
 */
export function findingsToAdvisories(
	packageName: string,
	version: string,
	findings: SourceFinding[],
): Bun.Security.Advisory[] {
	return findings.map(finding => ({
		level: finding.severity,
		package: packageName,
		version,
		url: null,
		description: `${finding.description}${finding.line ? ` (line ${finding.line})` : ''}`,
		categories: [finding.category],
	}));
}
