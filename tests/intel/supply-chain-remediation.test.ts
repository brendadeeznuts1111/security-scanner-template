import {expect, test} from 'bun:test';
import {
	formatRemediationQueueMarkdown,
	planSupplyChainRemediation,
	supplyChainReportToDoctorIssues,
} from '../../src/intel/supply-chain-remediation.ts';
import type {SupplyChainDeepScanReport} from '../../src/report/supply-chain-report.ts';

const baseReport: SupplyChainDeepScanReport = {
	profile: 'supply-chain-network',
	projectRoot: '/tmp/project',
	bundlePath: '/tmp/project/dist',
	identity: {
		capturedAt: '2026-06-23T12:00:00.000Z',
		bun: {version: '1.4.0', revision: 'test', main: '/tmp/main'},
		scanner: {name: '@acme/bun-security-scanner', version: '1.0.0'},
		domain: 'com.example.app',
	},
	bundle: {
		root: '/tmp/project/dist',
		scannedFiles: 1,
		files: [],
		findings: [
			{
				type: 'transpiler',
				file: 'dist/chunk.js',
				line: 12,
				ruleId: 'hardcoded-secret',
				severity: 'high',
				message: 'possible secret in bundle',
			},
		],
		durationMs: 1,
	},
	packages: {
		domain: 'com.example.app',
		root: '/tmp/project',
		scanned: 2,
		violations: [
			{
				package: 'left-pad',
				version: '1.0.0',
				severity: 'high',
				source: 'policy-blocked',
				message: 'blocked package',
				ruleId: 'block-left-pad',
				remediation: {
					safeRange: '>=2.0.0',
					suggestedVersion: '2.0.0',
					latestInRange: '2.0.0',
				},
			},
		],
		constraintViolations: [],
	},
	constraints: {
		root: '/tmp/project',
		scannedPackages: 1,
		scannedFiles: 0,
		transitive: false,
		violations: [
			{
				category: 'package',
				package: 'evil-pkg',
				severity: 'high',
				source: 'policy-constraint-block',
				message: 'blocked by policy',
				ruleId: 'block-evil',
			},
		],
	},
	policyPresent: true,
	durationMs: 5,
};

test('remediation plan queues upgrades, constraints, and bundle hints', () => {
	const plan = planSupplyChainRemediation(baseReport);
	expect(plan.autoFixableCount).toBeGreaterThan(0);
	expect(plan.queue.some(action => action.layer === 'packages' && action.kind === 'upgrade')).toBe(
		true,
	);
	expect(plan.queue.some(action => action.layer === 'constraints' && action.kind === 'remove')).toBe(
		true,
	);
	expect(plan.queue.some(action => action.layer === 'bundle' && action.kind === 'manual')).toBe(
		true,
	);
});

test('remediation queue markdown lists auto and manual actions', () => {
	const plan = planSupplyChainRemediation(baseReport);
	const markdown = formatRemediationQueueMarkdown(plan);
	expect(markdown).toContain('Remediation queue');
	expect(markdown).toContain('auto/packages');
	expect(markdown).toContain('manual/bundle');
});

test('doctor issues map bundle and policy violations', () => {
	const issues = supplyChainReportToDoctorIssues(baseReport);
	expect(issues.some(issue => issue.code === 'SUPPLY_CHAIN_FATAL')).toBe(true);
	expect(issues.some(issue => issue.code === 'POLICY_CONSTRAINT')).toBe(true);
	expect(issues.every(issue => issue.channel === 'supplyChain')).toBe(true);
});