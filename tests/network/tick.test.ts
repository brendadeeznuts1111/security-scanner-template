import {expect, test} from 'bun:test';
import {FIXED_TEST_ISO} from '../helpers.ts';
import {mkdirSync, mkdtempSync, writeFileSync} from 'fs';
import path from 'path';
import {tmpdir} from 'os';
import {
	diffNetworkBaseline,
	saveNetworkBaseline,
	NETWORK_BASELINE_VERSION,
} from '../../src/intel/network-baseline.ts';
import {runNetworkTick} from '../../src/network/tick.ts';
import {formatNetworkNdjsonLine, buildNetworkNdjsonEvent} from '../../src/network/ndjson.ts';
import {formatNetworkLoopStatusLine} from '../../src/network/loop-color.ts';

test('network tick exits 1 on baseline drift when fail-on-drift set', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'net-tick-'));
	const dist = path.join(root, 'dist');
	mkdirSync(dist, {recursive: true});
	writeFileSync(path.join(dist, 'app.js'), 'fetch("https://api.example.com/v1");\n');

	const baselinePath = path.join(root, 'baseline.json5');
	await saveNetworkBaseline(baselinePath, {
		version: NETWORK_BASELINE_VERSION,
		domain: 'com.example.tick',
		capturedAt: FIXED_TEST_ISO,
		bundlePath: dist,
		endpoints: [],
		healthRoutes: [],
		health: 'healthy',
	});

	const result = await runNetworkTick({
		domainId: 'com.example.tick',
		projectRoot: root,
		distPath: dist,
		phase: 'initial',
		baselinePath,
		failOnDrift: true,
		noColor: true,
		scanPatterns: async () => [],
		checkPackageVersions: async () => [],
	});

	expect(result.exitCode).toBe(1);
	expect(result.delta?.hasEndpointDrift).toBe(true);
});

test('baseline diff detects added endpoints', () => {
	const delta = diffNetworkBaseline(
		{
			version: NETWORK_BASELINE_VERSION,
			domain: 'com.example.tick',
			capturedAt: '2026-06-23T00:00:00.000Z',
			bundlePath: 'dist',
			endpoints: ['/api/a'],
			healthRoutes: ['/health'],
			health: 'healthy',
		},
		{
			endpoints: ['/api/a', '/api/b'],
			healthRoutes: ['/health'],
			health: 'healthy',
		},
	);
	expect(delta.endpoints.added).toEqual(['/api/b']);
	expect(delta.hasEndpointDrift).toBe(true);
});

test('ndjson line is single-line JSON', () => {
	const line = formatNetworkNdjsonLine(
		buildNetworkNdjsonEvent({
			type: 'probe',
			domain: 'com.example.tick',
			networkUnique: 2,
			networkRaw: 5,
			endpoints: 2,
			healthRoutes: 1,
			health: 'healthy',
			probesOk: 1,
			probesTotal: 1,
			latencyMs: 12,
		}),
	);
	expect(line.trim().startsWith('{')).toBe(true);
	expect(line.trim().endsWith('}')).toBe(true);
	expect(JSON.parse(line.trim()).type).toBe('probe');
});

test('loop color dashboard includes semantic segments', () => {
	const line = formatNetworkLoopStatusLine(
		{
			phase: 'initial',
			networkUnique: 3,
			networkRaw: 10,
			endpoints: 3,
			healthRoutes: 1,
			health: 'healthy',
			probesOk: 1,
			probesTotal: 1,
			latencyMs: 8,
		},
		undefined,
		true,
	);
	expect(line).toContain('[loop]');
	expect(line).toContain('network=3unique/10raw');
	expect(line).toContain('health=healthy');
});
