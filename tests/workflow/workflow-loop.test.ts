import {expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, writeFileSync} from 'fs';
import path from 'path';
import {tmpdir} from 'os';
import {applyDefaults} from '../../src/config/defaults.ts';
import type {DomainRegistry} from '../../src/config/registry.ts';
import type {DomainSecurity} from '../../src/config/security.ts';
import type {DomainConfig} from '../../src/config/types.ts';
import type {PackageSemverViolation} from '../../src/intel/semver-checks.ts';
import {runWorkflowCli} from '../../src/cli/workflow.ts';
import {WorkflowLoop} from '../../src/workflow/loop.ts';
import {aggregateWorkflowReport, workflowExitCode} from '../../src/workflow/output.ts';
import {resolveWorkflowScanners, WORKFLOW_SCANNER_IDS} from '../../src/workflow/scanners.ts';
import type {ScannerResult} from '../../src/workflow/types.ts';

function mockRegistry(
	config: DomainConfig,
	root: string,
	overrides: {
		checkPackageVersions?: DomainRegistry['checkPackageVersions'];
		scanPatterns?: DomainRegistry['scanPatterns'];
	} = {},
): DomainRegistry {
	return {
		root,
		async loadAll() {},
		async ensureDomain() {},
		get(domain: string) {
			if (domain !== config.domain) {
				throw new Error(`Unknown domain: ${domain}`);
			}
			return config;
		},
		has(domain: string) {
			return domain === config.domain;
		},
		list() {
			return [config.domain];
		},
		async security() {
			return {
				config,
				csrfSecret: 'test-secret',
			} as unknown as DomainSecurity;
		},
		async service() {
			throw new Error('not used');
		},
		watch() {},
		unwatch() {},
		checkPackageVersions:
			overrides.checkPackageVersions ?? (async () => [] as PackageSemverViolation[]),
		scanPatterns: overrides.scanPatterns ?? (async () => []),
		async loadThreatFeed() {},
		checkPackageThreats() {
			return [];
		},
		checkPackagesThreats() {
			return new Map();
		},
		getLoadedThreats() {
			return [];
		},
		async reloadDomain() {
			return null;
		},
	};
}

function semverFixture(): {root: string; config: DomainConfig; registry: DomainRegistry} {
	const root = mkdtempSync(path.join(tmpdir(), 'workflow-semver-'));
	mkdirSync(path.join(root, 'dist'), {recursive: true});
	const lodashDir = path.join(root, 'node_modules', 'lodash');
	mkdirSync(lodashDir, {recursive: true});
	writeFileSync(
		path.join(root, 'package.json'),
		JSON.stringify({dependencies: {lodash: '4.17.20'}}),
	);
	writeFileSync(
		path.join(lodashDir, 'package.json'),
		JSON.stringify({name: 'lodash', version: '4.17.20'}),
	);
	const config = applyDefaults({
		domain: 'com.example.workflow',
		csrf: {enabled: false, tokenLength: 32},
	});
	const registry = mockRegistry(config, root, {
		checkPackageVersions: async deps => {
			if (deps.lodash !== '4.17.20') return [];
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
					},
				},
			];
		},
	});
	return {root, config, registry};
}

test('resolveWorkflowScanners filters by id', () => {
	const selected = resolveWorkflowScanners(['semver', 'patterns']);
	expect(selected.map(scanner => scanner.id)).toEqual(['semver', 'patterns']);
	expect(selected.length).toBe(2);
});

test('resolveWorkflowScanners defaults to all scanners', () => {
	expect(resolveWorkflowScanners().map(scanner => scanner.id)).toEqual([...WORKFLOW_SCANNER_IDS]);
});

test('WorkflowLoop.runAll aggregates scanner results', async () => {
	const {config, registry} = semverFixture();
	const loop = new WorkflowLoop(config.domain, registry, {
		scanners: ['semver'],
		output: 'json',
		dryRun: true,
	});

	const report = await loop.runAll();
	expect(report.results).toHaveLength(1);
	expect(report.results[0]?.scannerId).toBe('semver');
	expect(report.results[0]?.issues).toHaveLength(1);
	expect(report.issueCount).toBe(1);
	expect(loop.status().runCount).toBe(1);
	expect(loop.exitCode(report)).toBe(1);
});

test('runWorkflowCli run exits without starting continuous loop', async () => {
	const {config, registry} = semverFixture();
	const exitCode = await runWorkflowCli({
		command: 'run',
		domain: config.domain,
		scanners: ['semver'],
		registry,
	});
	expect(exitCode).toBe(1);

	const statusLoop = new WorkflowLoop(config.domain, registry, {scanners: ['semver']});
	expect(statusLoop.status().running).toBe(false);
	expect(statusLoop.status().runCount).toBe(0);
});

test('workflowExitCode honors fail-on-drift', () => {
	const report = aggregateWorkflowReport('com.example.workflow', [], {
		semver: {
			expected: {violations: 0},
			actual: {violations: 1},
		},
	});
	expect(workflowExitCode(report, {failOnDrift: true})).toBe(1);
	expect(workflowExitCode(report, {failOnDrift: false})).toBe(0);
});

test('workflowExitCode honors fail-on-severity threshold', () => {
	const results: ScannerResult[] = [
		{
			scannerId: 'patterns',
			domain: 'com.example.workflow',
			timestamp: new Date().toISOString(),
			status: 'warning',
			issues: [{severity: 'low', message: 'minor finding'}],
		},
	];
	const report = aggregateWorkflowReport('com.example.workflow', results);
	expect(workflowExitCode(report, {failOnIssue: true, failOnSeverity: 'high'})).toBe(0);
	expect(workflowExitCode(report, {failOnIssue: true, failOnSeverity: 'low'})).toBe(1);
});

test('runWorkflowCli fails on issues when --fail-on-issue is set', async () => {
	const {config, registry} = semverFixture();
	const exitCode = await runWorkflowCli({
		command: 'run',
		domain: config.domain,
		scanners: ['semver'],
		failOnIssue: true,
		failOnSeverity: 'high',
		registry,
	});
	expect(exitCode).toBe(1);
});

test('runWorkflowCli status reports idle loop', async () => {
	const {config, registry} = semverFixture();
	const exitCode = await runWorkflowCli({
		command: 'status',
		domain: config.domain,
		registry,
	});
	expect(exitCode).toBe(0);
});
