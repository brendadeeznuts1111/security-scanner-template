import {expect, test} from 'bun:test';
import {mkdir, rm, writeFile} from 'fs/promises';
import path from 'path';
import {
	applyImportFix,
	planConstraintImportFixes,
	planConstraintSourcePins,
} from '../../src/intel/constraint-remediation.ts';
import {collectConstraintDoctorIssues} from '../../src/intel/constraint-checks.ts';

const TEST_DIR = `/tmp/constraint-remediation-${Date.now()}`;

test('planConstraintSourcePins dedupes blocked source packages', () => {
	const pins = planConstraintSourcePins([
		{
			category: 'source',
			source: 'policy-constraint-source',
			severity: 'high',
			package: 'evil-pkg',
			version: 'git+https://x',
			message: 'blocked',
			ruleId: 'source-block:git+',
		},
		{
			category: 'source',
			source: 'policy-constraint-source',
			severity: 'high',
			package: 'evil-pkg',
			version: 'git+https://y',
			message: 'blocked again',
			ruleId: 'source-block:file:',
		},
	]);
	expect(pins).toHaveLength(1);
	expect(pins[0]?.package).toBe('evil-pkg');
});

test('applyImportFix removes blocked import line', async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
	const file = 'src/app.ts';
	const target = path.join(TEST_DIR, file);
	await mkdir(path.dirname(target), {recursive: true});
	await writeFile(target, 'import cp from "child_process";\nexport const ok = 1;\n');

	const result = await applyImportFix(TEST_DIR, {
		category: 'import',
		source: 'policy-constraint-import',
		severity: 'high',
		file,
		line: 1,
		ruleId: 'constraint-import:child_process',
		message: 'blocked',
	});
	expect(result.ok).toBe(true);

	const updated = await Bun.file(target).text();
	expect(updated.includes('child_process')).toBe(false);
	expect(updated.includes('export const ok = 1')).toBe(true);
	await rm(TEST_DIR, {recursive: true, force: true});
});

test('planConstraintImportFixes dedupes file:line', () => {
	const fixes = planConstraintImportFixes([
		{
			category: 'import',
			source: 'policy-constraint-import',
			severity: 'high',
			file: 'src/a.ts',
			line: 4,
			ruleId: 'constraint-import:node:fs',
			message: 'a',
		},
		{
			category: 'import',
			source: 'policy-constraint-import',
			severity: 'high',
			file: 'src/a.ts',
			line: 4,
			ruleId: 'constraint-import:node:fs',
			message: 'dup',
		},
	]);
	expect(fixes).toHaveLength(1);
});

test('collectConstraintDoctorIssues surfaces license violations', async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
	const target = path.join(TEST_DIR, 'node_modules/gpl-lib/package.json');
	await mkdir(path.dirname(target), {recursive: true});
	await writeFile(target, JSON.stringify({name: 'gpl-lib', version: '1.0.0', license: 'GPL-3.0'}));
	await writeFile(
		path.join(TEST_DIR, 'package.json'),
		JSON.stringify({dependencies: {'gpl-lib': '1.0.0'}}),
	);
	await mkdir(path.join(TEST_DIR, 'src'), {recursive: true});
	await writeFile(path.join(TEST_DIR, 'src/index.ts'), 'export {};\n');

	const issues = await collectConstraintDoctorIssues(
		TEST_DIR,
		'com.example.test',
		'domains/test.json5',
		{
			constraints: {
				blockLicense: [{license: 'GPL-3.0', reason: 'copyleft', severity: 'high'}],
			},
		},
	);

	expect(issues.some(issue => issue.code === 'POLICY_CONSTRAINT_LICENSE')).toBe(true);
	await rm(TEST_DIR, {recursive: true, force: true});
});
