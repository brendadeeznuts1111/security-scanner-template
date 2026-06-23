import {expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'fs';
import path from 'path';
import {tmpdir} from 'os';
import {auditBundleNetwork} from '../../src/intel/network-audit.ts';
import {
	diffNetworkBaseline,
	NETWORK_BASELINE_VERSION,
} from '../../src/intel/network-baseline.ts';
import {resolveHealthSecretRef} from '../../src/network/health-secrets.ts';
import {formatNetworkLoopStatusLine} from '../../src/cli/supply-chain-network-colors.ts';
import {buildHerdrDoctorTabDocument, formatHerdrDoctorTabText} from '../../src/cli/supply-chain-network-herdr.ts';

test('auditBundleNetwork extracts unique urls and health routes', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'net-audit-'));
	const bundleDir = path.join(root, 'dist');
	mkdirSync(bundleDir, {recursive: true});
	writeFileSync(
		path.join(bundleDir, 'app.js'),
		'const u="https://api.example.com/v1/data"; fetch("/api/health");\n',
	);
	const audit = await auditBundleNetwork(bundleDir);
	expect(audit.raw).toBeGreaterThan(0);
	expect(audit.unique).toBeGreaterThan(0);
	expect(audit.endpoints.some(endpoint => endpoint.includes('api.example.com'))).toBe(true);
	expect(audit.healthRoutes.length).toBeGreaterThan(0);
	rmSync(root, {recursive: true, force: true});
});

test('resolveHealthSecretRef scopes secrets to supply-chain domain service', () => {
	expect(resolveHealthSecretRef('com.example.app', 'health/prod')).toEqual({
		service: 'supply-chain-com.example.app',
		name: 'health/prod',
		raw: 'health/prod',
	});
});

test('diffNetworkBaseline reports endpoint drift', () => {
	const delta = diffNetworkBaseline(
		{
			version: NETWORK_BASELINE_VERSION,
			domain: 'com.example.app',
			capturedAt: '2026-01-01T00:00:00.000Z',
			bundlePath: '/dist',
			endpoints: ['/api/a'],
			healthRoutes: ['/health'],
			health: 'healthy',
		},
		{
			endpoints: ['/api/a', '/api/b'],
			healthRoutes: ['/health', '/ready'],
			health: 'healthy',
		},
	);
	expect(delta.hasEndpointDrift).toBe(true);
	expect(delta.endpoints.added).toContain('/api/b');
	expect(delta.healthRoutes.added).toContain('/ready');
});

test('formatNetworkLoopStatusLine includes colored segments', () => {
	const line = formatNetworkLoopStatusLine({
		phase: 'initial',
		networkUnique: 20,
		networkRaw: 102,
		endpoints: 22,
		healthRoutes: 3,
		health: 'healthy',
		probesOk: 4,
		probesTotal: 4,
		latencyMs: 12,
	});
	expect(line).toContain('[loop]');
	expect(line).toContain('network=20unique/102raw');
	expect(line).toContain('health=healthy');
	expect(line).toContain('latency=12ms');
});

test('herdr doctor tab document renders field table', () => {
	const doc = buildHerdrDoctorTabDocument({
		phase: 'initial',
		networkUnique: 5,
		networkRaw: 8,
		endpoints: 5,
		healthRoutes: 1,
		health: 'unknown',
		probesOk: 0,
		probesTotal: 0,
		latencyMs: 0,
		bundlePath: '/tmp/dist',
	});
	const text = formatHerdrDoctorTabText(doc);
	expect(text).toContain('network-surface:');
	expect(text).toContain('api-catalog:');
});