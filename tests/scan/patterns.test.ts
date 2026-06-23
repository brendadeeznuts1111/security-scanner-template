import {expect, test, beforeEach, afterEach} from 'bun:test';
import {mkdir, rm, writeFile} from 'fs/promises';
import path from 'path';
import {DEFAULT_POLICY_FILE, loadPolicy} from '../../src/policy/loader.ts';
import {astPatternToRegex, patternRulesToTranspilerRules} from '../../src/policy/patterns.ts';
import {PatternScanner} from '../../src/scan/patterns/index.ts';

const TEST_DIR = `/tmp/pattern-scan-${Date.now()}`;

beforeEach(async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
	await mkdir(TEST_DIR, {recursive: true});
});

afterEach(async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
});

test('astPatternToRegex converts CallExpression selectors', () => {
	expect(astPatternToRegex("CallExpression[callee.name='eval']")).toBe('\\beval\\s*\\(');
	expect(astPatternToRegex("CallExpression[callee.name='String.fromCharCode']")).toBe(
		'String\\.fromCharCode\\s*\\(',
	);
});

test('loadPolicy parses patterns.regex and patterns.ast sections', async () => {
	const policyPath = path.join(TEST_DIR, DEFAULT_POLICY_FILE);
	await writeFile(
		policyPath,
		`
[[patterns.regex]]
id = "unsafe-eval"
description = "eval usage"
severity = "critical"
pattern = "eval\\\\s*\\\\("
fileGlob = ["**/*.ts"]

[[patterns.ast]]
id = "obfuscated-code"
description = "obfuscation"
severity = "medium"
astPattern = "CallExpression[callee.name='String.fromCharCode']"
fileGlob = ["**/*.js"]
`,
	);

	const doc = await loadPolicy(policyPath);
	expect(doc.patterns?.regex).toHaveLength(1);
	expect(doc.patterns?.regex?.[0]?.id).toBe('unsafe-eval');
	expect(doc.patterns?.ast).toHaveLength(1);
	expect(doc.patterns?.ast?.[0]?.astPattern).toContain('String.fromCharCode');
});

test('PatternScanner detects regex and ast policy violations', async () => {
	const srcDir = path.join(TEST_DIR, 'src');
	await mkdir(srcDir, {recursive: true});
	await writeFile(
		path.join(srcDir, 'bad.ts'),
		'const token = "abcdefghijklmnopqrstuvwxyz";\nexport const x = eval("1+1");\n',
	);
	await writeFile(
		path.join(srcDir, 'obfuscated.js'),
		'export const s = String.fromCharCode(65, 66);\n',
	);
	await writeFile(path.join(srcDir, 'env.ts'), 'const key = process.env.API_KEY;\n');

	await writeFile(
		path.join(TEST_DIR, DEFAULT_POLICY_FILE),
		`
[[patterns.regex]]
id = "hardcoded-secret"
description = "Hardcoded token"
severity = "high"
pattern = "(?:token|secret)\\\\s*=\\\\s*['\\"][^'\\"]{16,}['\\"]"
fileGlob = ["**/*.ts"]

[[patterns.regex]]
id = "unsafe-eval"
description = "eval usage"
severity = "critical"
pattern = "eval\\\\s*\\\\("
fileGlob = ["**/*.ts"]

[[patterns.ast]]
id = "obfuscated-code"
description = "fromCharCode obfuscation"
severity = "medium"
astPattern = "CallExpression[callee.object.name='String'][callee.property.name='fromCharCode']"
fileGlob = ["**/*.js"]

[[patterns.ast]]
id = "process-env-access"
description = "process.env access"
severity = "medium"
astPattern = "MemberExpression[object.name='process'][property.name='env']"
fileGlob = ["**/*.ts"]
`,
	);

	const doc = await loadPolicy(path.join(TEST_DIR, DEFAULT_POLICY_FILE));
	const scanner = new PatternScanner(doc);
	const matches = await scanner.scanDirectory(srcDir);

	expect(matches.some(m => m.ruleId === 'hardcoded-secret')).toBe(true);
	expect(matches.some(m => m.ruleId === 'unsafe-eval')).toBe(true);
	expect(matches.some(m => m.ruleId === 'obfuscated-code')).toBe(true);
	expect(matches.some(m => m.ruleId === 'process-env-access')).toBe(true);
});

test('PatternScanner ast matches include source line and column', async () => {
	const srcDir = path.join(TEST_DIR, 'ast-loc');
	await mkdir(srcDir, {recursive: true});
	await writeFile(path.join(srcDir, 'eval.ts'), 'export const x = eval("hack");\n');

	await writeFile(
		path.join(TEST_DIR, DEFAULT_POLICY_FILE),
		`
[[patterns.ast]]
id = "unsafe-eval-ast"
description = "eval via AST"
severity = "critical"
astPattern = "CallExpression[callee.name='eval']"
fileGlob = ["**/*.ts"]
`,
	);

	const policy = await loadPolicy(path.join(TEST_DIR, DEFAULT_POLICY_FILE));
	const scanner = new PatternScanner(policy);
	const matches = await scanner.scanDirectory(srcDir);
	const hit = matches.find(m => m.ruleId === 'unsafe-eval-ast');
	expect(hit).toBeDefined();
	expect(hit!.line).toBeGreaterThan(0);
	expect(hit!.column).toBeGreaterThan(0);
	expect(hit!.snippet).toContain('eval');
});

test('patternRulesToTranspilerRules maps regex and ast entries', () => {
	const rules = patternRulesToTranspilerRules({
		regex: [
			{
				id: 'regex-rule',
				description: 'regex',
				severity: 'high',
				pattern: 'foo',
			},
		],
		ast: [
			{
				id: 'ast-rule',
				description: 'ast',
				severity: 'medium',
				astPattern: "CallExpression[callee.name='eval']",
			},
		],
	});

	expect(rules).toHaveLength(2);
	expect(rules.find(rule => rule.id === 'regex-rule')?.type).toBe('regex');
	expect(rules.find(rule => rule.id === 'ast-rule')?.type).toBe('ast');
	expect(rules.find(rule => rule.id === 'ast-rule')?.pattern).toBe('\\beval\\s*\\(');
});
