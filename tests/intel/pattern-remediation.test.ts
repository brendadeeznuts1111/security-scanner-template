import {expect, test, beforeEach, afterEach} from 'bun:test';
import {mkdir, rm, writeFile, readFile} from 'fs/promises';
import path from 'path';
import {
	applyPatternFix,
	enrichPatternMatches,
	formatPatternRemediationLine,
	suggestPatternRemediation,
} from '../../src/intel/pattern-remediation.ts';
import type {PatternMatch} from '../../src/scan/patterns/index.ts';

const TEST_DIR = `/tmp/pattern-remediation-${Date.now()}`;

beforeEach(async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
	await mkdir(TEST_DIR, {recursive: true});
});

afterEach(async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
});

const secretMatch: PatternMatch = {
	ruleId: 'hardcoded-secret',
	file: 'src/auth.ts',
	line: 2,
	column: 7,
	severity: 'high',
	message: 'Hardcoded API key or token',
	snippet: 'token = "abcdefghijklmnopqrstuvwxyz"',
};

test('suggestPatternRemediation uses catalog defaults', () => {
	const suggestion = suggestPatternRemediation(secretMatch);
	expect(suggestion.fixKind).toBe('env-var');
	expect(suggestion.autoFixable).toBe(true);
	expect(suggestion.envVar).toBe('API_TOKEN');
	expect(suggestion.hint).toContain('environment');
});

test('suggestPatternRemediation prefers policy override', () => {
	const suggestion = suggestPatternRemediation(secretMatch, {
		patterns: {
			regex: [
				{
					id: 'hardcoded-secret',
					description: 'x',
					severity: 'high',
					pattern: 'x',
					remediation: 'Use the domain vault for API tokens.',
				},
			],
		},
	});
	expect(suggestion.hint).toBe('Use the domain vault for API tokens.');
});

test('formatPatternRemediationLine includes hint and example', () => {
	const [match] = enrichPatternMatches([secretMatch]);
	const line = formatPatternRemediationLine(match!);
	expect(line).toContain('hardcoded-secret');
	expect(line).toContain('process.env');
});

test('applyPatternFix replaces hardcoded secret with env var scaffold', async () => {
	const filePath = path.join(TEST_DIR, 'auth.ts');
	await writeFile(filePath, 'export const token = "abcdefghijklmnopqrstuvwxyz";\n');

	const [match] = enrichPatternMatches([{...secretMatch, file: filePath, line: 1}]);
	const result = await applyPatternFix(TEST_DIR, match!);
	expect(result.ok).toBe(true);

	const updated = await readFile(filePath, 'utf8');
	expect(updated).toContain('process.env.API_TOKEN');
	expect(updated).not.toContain('abcdefghijklmnopqrstuvwxyz');
});

test('applyPatternFix rejects manual-only rules', async () => {
	const [match] = enrichPatternMatches([
		{
			ruleId: 'unsafe-eval',
			file: 'x.ts',
			line: 1,
			column: 1,
			severity: 'critical',
			message: 'eval',
		},
	]);
	const result = await applyPatternFix(TEST_DIR, match!);
	expect(result.ok).toBe(false);
});
