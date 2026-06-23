import {expect, test} from 'bun:test';
import {mkdir, rm, writeFile} from 'fs/promises';
import path from 'path';
import {scanPolicyConstraints} from '../../src/intel/constraint-checks.ts';
import {
	planConstraintInstalls,
	planConstraintRemovals,
} from '../../src/intel/constraint-remediation.ts';
import {DEFAULT_POLICY_FILE} from '../../src/policy/loader.ts';

const TEST_DIR = `/tmp/constraint-deep-${Date.now()}`;

async function writeProject(files: Record<string, string>): Promise<void> {
	for (const [relative, content] of Object.entries(files)) {
		const target = path.join(TEST_DIR, relative);
		await mkdir(path.dirname(target), {recursive: true});
		await writeFile(target, content);
	}
}

test('scanPolicyConstraints detects blocked git sources and imports', async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
	await writeProject({
		'package.json': JSON.stringify({
			dependencies: {
				'axios': '1.0.0',
				'evil-pkg': 'git+https://github.com/example/evil',
			},
		}),
		'src/app.ts': `import cp from "child_process";\nexport const x = cp;\n`,
		[`${DEFAULT_POLICY_FILE}`]: `
[[constraints.blockSource]]
pattern = "git+"
reason = "Git deps blocked"
severity = "critical"

[[constraints.blockImport]]
pattern = "child_process"
reason = "No subprocess"
severity = "high"
`,
		'node_modules/axios/package.json': JSON.stringify({
			name: 'axios',
			version: '1.0.0',
			license: 'MIT',
		}),
	});

	const report = await scanPolicyConstraints({
		root: TEST_DIR,
		policy: {
			constraints: {
				blockSource: [{pattern: 'git+', reason: 'Git deps blocked', severity: 'critical'}],
				blockImport: [{pattern: 'child_process', reason: 'No subprocess', severity: 'high'}],
			},
		},
		sourcePath: 'src/',
	});

	expect(report.violations.some(v => v.category === 'source' && v.package === 'evil-pkg')).toBe(
		true,
	);
	expect(report.violations.some(v => v.remediation?.includes('bun add evil-pkg'))).toBe(true);
	expect(report.violations.some(v => v.category === 'import' && v.file?.includes('app.ts'))).toBe(
		true,
	);
	expect(report.scannedFiles).toBeGreaterThan(0);

	await rm(TEST_DIR, {recursive: true, force: true});
});

test('scanPolicyConstraints flags blocked licenses in transitive scan', async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
	await writeProject({
		'package.json': JSON.stringify({dependencies: {app: '1.0.0'}}),
		'node_modules/app/package.json': JSON.stringify({name: 'app', version: '1.0.0'}),
		'node_modules/gpl-lib/package.json': JSON.stringify({
			name: 'gpl-lib',
			version: '2.0.0',
			license: 'GPL-3.0',
		}),
	});

	const report = await scanPolicyConstraints({
		root: TEST_DIR,
		policy: {
			constraints: {
				scanTransitive: true,
				blockLicense: [{license: 'GPL-3.0', reason: 'Copyleft blocked', severity: 'high'}],
			},
		},
		transitive: true,
		scanImports: false,
	});

	expect(report.transitive).toBe(true);
	expect(report.violations.some(v => v.category === 'license' && v.package === 'gpl-lib')).toBe(
		true,
	);

	await rm(TEST_DIR, {recursive: true, force: true});
});

test('planConstraintRemovals and planConstraintInstalls derive bun commands', () => {
	const removals = planConstraintRemovals([
		{
			category: 'package',
			source: 'policy-constraint-block',
			severity: 'critical',
			package: 'event-stream',
			version: '3.3.6',
			message: 'blocked',
			ruleId: 'block:event-stream',
			remediation: 'Remove with: bun remove event-stream',
		},
	]);
	expect(removals).toHaveLength(1);
	expect(removals[0]?.package).toBe('event-stream');

	const installs = planConstraintInstalls([
		{
			category: 'require',
			source: 'policy-constraint-require',
			severity: 'high',
			package: 'lodash',
			version: 'missing',
			message: 'missing',
			ruleId: 'require:lodash',
			remediation: 'Install with: bun add lodash@>=4.17.21',
		},
	]);
	expect(installs).toHaveLength(1);
	expect(installs[0]?.package).toBe('lodash');
	expect(installs[0]?.version).toBe('>=4.17.21');
});
