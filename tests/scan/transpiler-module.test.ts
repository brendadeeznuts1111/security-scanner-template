import {expect, test, beforeEach, afterEach} from 'bun:test';
import {mkdir, rm, writeFile} from 'fs/promises';
import path from 'path';
import {
	DEFAULT_TRANSPILER_RULES,
	resolveTranspilerRules,
	loadTranspilerRules,
} from '../../src/scan/transpiler/rule-engine.ts';
import {scanSourceWithRules} from '../../src/scan/transpiler/analyzer.ts';
import {scanDirectory} from '../../src/scan/transpiler/bundle-scanner.ts';
import {
	formatTranspilerReportJson,
	formatTranspilerReportMarkdown,
	hasCriticalFindings,
} from '../../src/scan/transpiler/reporter.ts';
import {verifyFileIntegrity} from '../../src/scan/transpiler/integrity.ts';
import {IntegrityHasher} from '../../src/integrity/hasher.ts';

const TEST_DIR = `/tmp/transpiler-module-${Date.now()}`;

beforeEach(async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
	await mkdir(TEST_DIR, {recursive: true});
});

afterEach(async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
});

test('scanSourceWithRules detects unsafe-eval and hardcoded secrets', () => {
	const source = `
const api_key = "abcdefghijklmnopqrstuvwxyz";
export const x = eval("1+1");
`;
	const findings = scanSourceWithRules(source, 'evil.ts', DEFAULT_TRANSPILER_RULES);
	expect(findings.some(f => f.ruleId === 'unsafe-eval')).toBe(true);
	expect(findings.some(f => f.ruleId === 'hardcoded-secret')).toBe(true);
});

test('resolveTranspilerRules filters by id', () => {
	const selected = resolveTranspilerRules(DEFAULT_TRANSPILER_RULES, ['unsafe-eval']);
	expect(selected).toHaveLength(1);
	expect(selected[0]?.id).toBe('unsafe-eval');
});

test('scanDirectory walks include paths and reports findings', async () => {
	const dist = path.join(TEST_DIR, 'dist');
	await mkdir(dist, {recursive: true});
	await writeFile(path.join(dist, 'bundle.js'), 'export const bad = eval("hack");');

	const report = await scanDirectory({
		root: TEST_DIR,
		config: {
			enabled: true,
			includePaths: ['dist/'],
			excludePatterns: [],
			rules: [],
			verifyIntegrity: false,
		},
	});

	expect(report.scannedFiles).toBe(1);
	expect(report.findings.some(f => f.ruleId === 'unsafe-eval')).toBe(true);
});

test('load transpiler rules from toml rule blocks', async () => {
	const rulesPath = path.join(TEST_DIR, 'rules.toml');
	await writeFile(
		rulesPath,
		`[[rule]]
id = "custom-rule"
description = "Test rule"
severity = "low"
type = "regex"
pattern = "CUSTOM_MARKER"
`,
	);

	const rules = await loadTranspilerRules(rulesPath);
	expect(rules).toHaveLength(1);
	expect(rules[0]?.id).toBe('custom-rule');
});

test('verifyFileIntegrity flags hash mismatch', () => {
	const hasher = new IntegrityHasher();
	const source = 'export const ok = 1;';
	const hash = hasher.digestSync(source);
	const wrong = '0'.repeat(hash.length);

	const result = verifyFileIntegrity(
		hasher,
		source,
		'dist/bundle.js',
		{files: {'dist/bundle.js': wrong}},
		'/tmp/dist/bundle.js',
	);

	expect(result.mismatch).toBe(true);
	expect(result.finding?.ruleId).toBe('integrity-mismatch');
});

test('reporter formats JSON and markdown', () => {
	const report = {
		root: TEST_DIR,
		scannedFiles: 1,
		findings: [
			{
				type: 'transpiler' as const,
				file: '/tmp/evil.js',
				line: 1,
				ruleId: 'unsafe-eval',
				severity: 'critical' as const,
				message: 'Detects use of eval()',
			},
		],
		files: [],
	};

	const json = formatTranspilerReportJson(report);
	expect(json).toContain('unsafe-eval');

	const markdown = formatTranspilerReportMarkdown(report);
	expect(markdown).toContain('# Transpiler Scan Report');
	expect(hasCriticalFindings(report.findings)).toBe(true);
});
