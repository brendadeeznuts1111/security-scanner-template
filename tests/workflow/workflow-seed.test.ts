import {expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, writeFileSync} from 'fs';
import path from 'path';
import {tmpdir} from 'os';
import {applyDefaults} from '../../src/config/defaults.ts';
import type {DomainRegistry} from '../../src/config/registry.ts';
import type {DomainSecurity} from '../../src/config/security.ts';
import type {DomainConfig} from '../../src/config/types.ts';
import type {PackageSemverViolation} from '../../src/intel/semver-checks.ts';
import {WorkflowLoop} from '../../src/workflow/loop.ts';
import {
	buildWorkflowSeedDocument,
	computeWorkflowSeedDrift,
	loadWorkflowSeed,
	WORKFLOW_SEED_SCHEMA,
	writeWorkflowSeed,
} from '../../src/workflow/seed.ts';
import type {ScannerResult} from '../../src/workflow/types.ts';

function mockRegistry(config: DomainConfig, root: string): DomainRegistry {
	return {
		root,
		async loadAll() {},
		async ensureDomain() {},
		get(domain: string) {
			if (domain !== config.domain) throw new Error(`Unknown domain: ${domain}`);
			return config;
		},
		has(domain: string) {
			return domain === config.domain;
		},
		list() {
			return [config.domain];
		},
		async security() {
			return {config, csrfSecret: 'test-secret'} as unknown as DomainSecurity;
		},
		async service() {
			throw new Error('not used');
		},
		watch() {},
		unwatch() {},
		checkPackageVersions: async () => [] as PackageSemverViolation[],
		scanPatterns: async () => [],
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

function semverResult(violations: number): ScannerResult {
	return {
		scannerId: 'semver',
		domain: 'com.example.seed',
		timestamp: new Date().toISOString(),
		status: violations > 0 ? 'fail' : 'pass',
		issues: [],
		metrics: {
			scanned: 2,
			violations,
			packages: {lodash: '4.17.21', axios: '1.0.0'},
		},
	};
}

test('buildWorkflowSeedDocument captures scanner metrics', () => {
	const document = buildWorkflowSeedDocument('com.example.seed', [semverResult(0)]);
	expect(document.schema).toBe(WORKFLOW_SEED_SCHEMA);
	expect(document.domain).toBe('com.example.seed');
	expect(document.state.semver?.packages).toEqual({lodash: '4.17.21', axios: '1.0.0'});
});

test('computeWorkflowSeedDrift reports metric changes', () => {
	const seed = buildWorkflowSeedDocument('com.example.seed', [semverResult(0)]);
	const drift = computeWorkflowSeedDrift([semverResult(1)], seed);
	expect(drift.semver?.actual.violations).toBe(1);
	expect(drift.semver?.expected.violations).toBe(0);
});

test('loadWorkflowSeed validates domain', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'workflow-seed-'));
	const seedPath = path.join(root, 'seed.json5');
	const seed = buildWorkflowSeedDocument('com.example.seed', [semverResult(0)]);
	await writeWorkflowSeed(seedPath, seed);
	await expect(loadWorkflowSeed(seedPath, 'com.other.seed')).rejects.toThrow(/does not match/);
});

test('WorkflowLoop loads seed and detects drift', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'workflow-seed-loop-'));
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
		domain: 'com.example.seed',
		csrf: {enabled: false, tokenLength: 32},
	});
	const registry = mockRegistry(config, root);

	const seedPath = path.join(root, 'seed.json5');
	await writeWorkflowSeed(
		seedPath,
		buildWorkflowSeedDocument(config.domain, [
			{
				scannerId: 'semver',
				domain: config.domain,
				timestamp: new Date().toISOString(),
				status: 'pass',
				issues: [],
				metrics: {scanned: 1, violations: 0, packages: {lodash: '4.17.21'}},
			},
		]),
	);

	const loop = new WorkflowLoop(config.domain, registry, {
		scanners: ['semver'],
		output: 'json',
		dryRun: true,
		seedPath,
		failOnDrift: true,
	});

	await loop.loadSeed();
	expect(loop.seedState()?.domain).toBe(config.domain);

	const report = await loop.runAll();
	expect(report.drift?.semver).toBeDefined();
	expect(loop.exitCode(report)).toBe(1);
});

test('WorkflowLoop --seed-write captures current state', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'workflow-seed-write-'));
	mkdirSync(path.join(root, 'dist'), {recursive: true});
	const config = applyDefaults({
		domain: 'com.example.seed-write',
		csrf: {enabled: false, tokenLength: 32},
	});
	const registry = mockRegistry(config, root);
	const seedOut = path.join(root, 'captured-seed.json5');

	const loop = new WorkflowLoop(config.domain, registry, {
		scanners: ['semver'],
		output: 'json',
		dryRun: true,
		seedWritePath: seedOut,
	});

	await loop.runAll();
	const loaded = await loadWorkflowSeed(seedOut, config.domain);
	expect(loaded?.state.semver).toBeDefined();
});
