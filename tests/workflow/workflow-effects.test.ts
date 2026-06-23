import {expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'fs';
import path from 'path';
import {tmpdir} from 'os';
import type {DomainRegistry} from '../../src/config/registry.ts';
import type {PackageSemverViolation} from '../../src/intel/semver-checks.ts';
import {
	applyWorkflowFixes,
	buildWorkflowAlertPayload,
	generateWorkflowReport,
	runWorkflowEffects,
	sendWorkflowAlert,
} from '../../src/workflow/effects/index.ts';
import {aggregateWorkflowReport, formatWorkflowMarkdown} from '../../src/workflow/output.ts';
import type {ScannerResult} from '../../src/workflow/types.ts';

function semverResult(issues: ScannerResult['issues']): ScannerResult {
	return {
		scannerId: 'semver',
		domain: 'com.example.effects',
		timestamp: '2026-06-23T00:00:00.000Z',
		status: 'fail',
		issues,
		metrics: {
			scanned: 1,
			violations: issues.length,
			packages: {lodash: '4.17.20'},
		},
	};
}

test('sendWorkflowAlert posts JSON payload to webhook', async () => {
	let capturedUrl = '';
	let capturedBody = '';
	const report = aggregateWorkflowReport('com.example.effects', [semverResult([])]);
	const payload = buildWorkflowAlertPayload(report);

	const result = await sendWorkflowAlert('https://hooks.example.test/alert', payload, {
		fetchFn: async (url, init) => {
			capturedUrl = String(url);
			capturedBody = String(init?.body ?? '');
			return new Response('ok', {status: 200});
		},
	});

	expect(result.ok).toBe(true);
	expect(capturedUrl).toBe('https://hooks.example.test/alert');
	const parsed = JSON.parse(capturedBody) as {domain: string; results: {scanner: string}[]};
	expect(parsed.domain).toBe('com.example.effects');
	expect(parsed.results[0]?.scanner).toBe('semver');
});

test('applyWorkflowFixes upgrades high/critical semver violations', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'workflow-fix-'));
	const spawned: string[] = [];
	const registry = {
		root,
		async checkPackageVersions() {
			return [
				{
					package: 'lodash',
					version: '4.17.20',
					rule: {
						id: 'block-lodash',
						package: 'lodash',
						range: '<4.17.21',
						severity: 'high',
						description: 'blocked',
						safeRange: '>=4.17.21',
					},
				},
			] as PackageSemverViolation[];
		},
	} as unknown as DomainRegistry;

	const results = await applyWorkflowFixes(
		{
			domain: 'com.example.effects',
			projectRoot: root,
			registry,
			results: [
				semverResult([{severity: 'high', message: 'lodash@4.17.20 violates block-lodash'}]),
			],
		},
		{
			applyUpgrade: async (_root, pkg, version) => {
				spawned.push(`${pkg}@${version}`);
				return {ok: true, message: `Upgraded ${pkg} to ${version}`};
			},
		},
	);

	expect(spawned).toHaveLength(1);
	expect(spawned[0]).toMatch(/^lodash@4\.17\.\d+|^lodash@4\.18\.\d+/);
	expect(results[0]?.ok).toBe(true);
});

test('generateWorkflowReport writes markdown to disk', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'workflow-report-'));
	const reportPath = path.join(root, 'reports', 'latest.md');
	const report = aggregateWorkflowReport('com.example.effects', [
		semverResult([{severity: 'high', message: 'lodash@4.17.20 violates block-lodash'}]),
	]);

	await generateWorkflowReport(report, reportPath, formatWorkflowMarkdown);
	const written = readFileSync(reportPath, 'utf8');
	expect(written).toContain('# Workflow Report: com.example.effects');
	expect(written).toContain('lodash@4.17.20 violates block-lodash');
});

test('runWorkflowEffects combines alert, fix, and report', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'workflow-effects-'));
	mkdirSync(path.join(root, 'reports'), {recursive: true});
	let alertCalled = false;
	const registry = {
		root,
		async checkPackageVersions() {
			return [
				{
					package: 'lodash',
					version: '4.17.20',
					rule: {
						id: 'block-lodash',
						package: 'lodash',
						range: '<4.17.21',
						severity: 'critical',
						description: 'blocked',
						safeRange: '>=4.17.21',
					},
				},
			] as PackageSemverViolation[];
		},
	} as unknown as DomainRegistry;

	const results = [semverResult([{severity: 'critical', message: 'lodash blocked'}])];
	const report = aggregateWorkflowReport('com.example.effects', results);

	const effectResult = await runWorkflowEffects(
		{
			domain: 'com.example.effects',
			projectRoot: root,
			registry,
			report,
			results,
			effects: {
				alert: 'https://hooks.example.test/alert',
				fix: true,
				report: 'reports/run.md',
			},
		},
		{
			fetchFn: async () => {
				alertCalled = true;
				return new Response('ok', {status: 200});
			},
			applyUpgrade: async () => ({ok: true, message: 'ok'}),
		},
	);

	expect(alertCalled).toBe(true);
	expect(effectResult.alertSent).toBe(true);
	expect(effectResult.fixes?.length).toBe(1);
	expect(effectResult.reportPath).toBe(path.join(root, 'reports', 'run.md'));
	expect(readFileSync(effectResult.reportPath!, 'utf8')).toContain('com.example.effects');
});

test('runWorkflowEffects loads custom plugins from effectsDir', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'workflow-custom-effect-'));
	const effectsDir = path.join(root, 'effects');
	mkdirSync(effectsDir, {recursive: true});
	const marker = path.join(root, 'marker.txt');
	writeFileSync(
		path.join(effectsDir, 'marker-effect.ts'),
		`const plugin = {
  id: 'marker',
  name: 'Marker',
  description: 'writes a marker file',
  async run(ctx) {
    await Bun.write(${JSON.stringify(marker)}, ctx.domain);
  },
};
export default plugin;
`,
	);

	const report = aggregateWorkflowReport('com.example.custom', []);
	const result = await runWorkflowEffects({
		domain: 'com.example.custom',
		projectRoot: root,
		registry: {root} as unknown as DomainRegistry,
		report,
		results: [],
		effects: {log: false},
		effectsDir: 'effects',
	});

	expect(result.customEffects).toEqual(['marker']);
	expect(readFileSync(marker, 'utf8')).toBe('com.example.custom');
});
