import {expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, writeFileSync} from 'fs';
import path from 'path';
import {tmpdir} from 'os';
import {
	isSupplyChainScanProfile,
	resolveSupplyChainProfile,
	SUPPLY_CHAIN_SCAN_PROFILES,
} from '../../src/cli/supply-chain-profiles.ts';
import {
	resolveProjectRootFromPath,
	resolveSupplyChainScanPath,
} from '../../src/cli/supply-chain-path.ts';
import {planSupplyChainRemediation} from '../../src/intel/supply-chain-remediation.ts';
import {
	formatSupplyChainScanMarkdown,
	supplyChainScanHasBlockingFindings,
	type SupplyChainDeepScanReport,
} from '../../src/report/supply-chain-report.ts';
import {resolveBundleIncludePaths} from '../../src/scan/transpiler/bundle-scanner.ts';

const fixtureIdentity: SupplyChainDeepScanReport['identity'] = {
	capturedAt: '2026-06-23T12:00:00.000Z',
	bun: {version: '1.4.0', revision: 'test', main: '/tmp/main'},
	scanner: {
		name: '@acme/bun-security-scanner',
		version: '1.0.0',
		author: 'Acme Corp Security Team <security@acme.example.com>',
	},
	target: {
		name: 'fixture-app',
		version: '0.1.0',
		author: 'Fixture Author <author@example.com>',
	},
};

test('supply-chain-network profile selects network transpiler rules and all layers', () => {
	expect(isSupplyChainScanProfile('supply-chain-network')).toBe(true);
	const profile = resolveSupplyChainProfile('supply-chain-network');
	expect(profile.rules).toEqual(SUPPLY_CHAIN_SCAN_PROFILES['supply-chain-network'].rules);
	expect(profile.includeBundle).toBe(true);
	expect(profile.includePackages).toBe(true);
	expect(profile.includeConstraints).toBe(true);
	expect(profile.scanImports).toBe(true);
});

test('supply-chain-secrets profile is bundle-only', () => {
	const profile = resolveSupplyChainProfile('supply-chain-secrets');
	expect(profile.includeBundle).toBe(true);
	expect(profile.includePackages).toBe(false);
	expect(profile.includeConstraints).toBe(false);
});

test('resolveBundleIncludePaths scans bundle root when no nested dist exists', () => {
	const include = resolveBundleIncludePaths('/tmp/my-bundle-out');
	expect(include).toEqual(['.']);
});

test('resolveSupplyChainScanPath resolves existing relative paths', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'sc-path-'));
	const bundleDir = path.join(root, 'dist');
	mkdirSync(bundleDir, {recursive: true});
	writeFileSync(path.join(bundleDir, 'index.js'), 'export {};\n');

	const resolved = resolveSupplyChainScanPath(path.join(root, 'dist'));
	expect(resolved).toBe(path.resolve(root, 'dist'));
});

test('resolveProjectRootFromPath walks up to package.json', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'sc-root-'));
	const bundleDir = path.join(root, 'dist', 'assets');
	mkdirSync(bundleDir, {recursive: true});
	writeFileSync(path.join(root, 'package.json'), '{"name":"fixture"}\n');
	writeFileSync(path.join(bundleDir, 'chunk.js'), 'export {};\n');

	expect(resolveProjectRootFromPath(bundleDir)).toBe(root);
	expect(resolveProjectRootFromPath(path.join(bundleDir, 'chunk.js'))).toBe(root);
});

test('formatSupplyChainScanMarkdown includes remediation queue', () => {
		const report: SupplyChainDeepScanReport = {
			profile: 'supply-chain-network',
			projectRoot: '/tmp/project',
			bundlePath: '/tmp/project/dist',
			identity: fixtureIdentity,
			bundle: {
				root: '/tmp/project/dist',
				scannedFiles: 1,
				findings: [
					{
						type: 'transpiler',
						ruleId: 'remote-import',
						severity: 'medium',
						message: 'dynamic import',
						file: '/tmp/project/dist/app.js',
						line: 2,
						column: 1,
					},
				],
				files: [],
			},
			policyPresent: false,
			durationMs: 2,
		};
		report.remediation = planSupplyChainRemediation(report);
		const md = formatSupplyChainScanMarkdown(report);
		expect(md).toContain('## Remediation queue');
		expect(md).toContain('manual/bundle');
	});

test('formatSupplyChainScanMarkdown notes missing policy', () => {
	const report: SupplyChainDeepScanReport = {
		profile: 'supply-chain-network',
		projectRoot: '/tmp/project',
		bundlePath: '/tmp/project/dist',
		identity: fixtureIdentity,
		bundle: {
			root: '/tmp/project/dist',
			scannedFiles: 1,
			findings: [],
			files: [],
			durationMs: 1,
		},
		policyPresent: false,
		durationMs: 2,
	};
	const md = formatSupplyChainScanMarkdown(report);
	expect(md).toContain('_none — packages/constraints skipped_');
	expect(md).toContain('supply-chain-network');
	expect(md).toContain('@acme/bun-security-scanner@1.0.0');
	expect(md).toContain('Acme Corp Security Team');
	expect(md).toContain('fixture-app@0.1.0');
	expect(md).toContain('Fixture Author');
});

test('supplyChainScanHasBlockingFindings respects bundle high severity', () => {
	const report: SupplyChainDeepScanReport = {
		profile: 'default',
		projectRoot: null,
		bundlePath: '/tmp',
		identity: fixtureIdentity,
		bundle: {
			root: '/tmp',
			scannedFiles: 1,
			findings: [
				{
					type: 'transpiler',
					ruleId: 'remote-import',
					severity: 'high',
					message: 'blocked',
					file: 'a.js',
					line: 1,
					column: 1,
				},
			],
			files: [],
			durationMs: 1,
		},
		policyPresent: false,
		durationMs: 1,
	};
	expect(supplyChainScanHasBlockingFindings(report)).toBe(true);
});

test('supplyChainScanHasBlockingFindings ignores medium bundle findings', () => {
	const report: SupplyChainDeepScanReport = {
		profile: 'default',
		projectRoot: null,
		bundlePath: '/tmp',
		identity: fixtureIdentity,
		bundle: {
			root: '/tmp',
			scannedFiles: 1,
			findings: [
				{
					type: 'transpiler',
					ruleId: 'remote-import',
					severity: 'medium',
					message: 'warn',
					file: 'a.js',
					line: 1,
					column: 1,
				},
			],
			files: [],
			durationMs: 1,
		},
		policyPresent: false,
		durationMs: 1,
	};
	expect(supplyChainScanHasBlockingFindings(report)).toBe(false);
});