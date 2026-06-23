import {expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, writeFileSync} from 'fs';
import path from 'path';
import {tmpdir} from 'os';
import {computeDistFingerprint, NetworkLoop, probeNetworkHealth} from '../../src/network/loop.ts';

function createLoopFixture(): {testRoot: string; distDir: string} {
	const testRoot = mkdtempSync(path.join(tmpdir(), 'net-loop-'));
	const distDir = path.join(testRoot, 'dist');
	mkdirSync(distDir, {recursive: true});
	writeFileSync(path.join(testRoot, 'package.json'), '{"dependencies":{"lodash":"4.17.20"}}\n');
	writeFileSync(path.join(distDir, 'app.js'), 'export const ok = true;\n');
	return {testRoot, distDir};
}

test('full audit invokes pattern scan and package version checks', async () => {
	const {testRoot, distDir} = createLoopFixture();
	let patternsScanned = false;
	let versionsChecked = false;

	const loop = new NetworkLoop({
		domainId: 'com.example.network',
		projectRoot: testRoot,
		distPath: distDir,
		scanPatterns: async dir => {
			patternsScanned = true;
			expect(dir).toBe(distDir);
			return [
				{
					ruleId: 'test',
					file: 'app.js',
					line: 1,
					column: 1,
					severity: 'low',
					message: 'match',
				},
			];
		},
		checkPackageVersions: async deps => {
			versionsChecked = true;
			expect(deps.lodash).toBe('4.17.20');
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

	const summary = await loop.auditNow();
	expect(patternsScanned).toBe(true);
	expect(versionsChecked).toBe(true);
	expect(summary.patternMatches).toBe(1);
	expect(summary.semverViolations).toBe(1);
});

test('health probe reports healthy responses', async () => {
	const server = Bun.serve({
		port: 0,
		fetch: () => new Response('ok', {status: 200}),
	});
	try {
		const result = await probeNetworkHealth(`http://127.0.0.1:${server.port}/health`);
		expect(result.status).toBe('healthy');
		expect(result.latencyMs).toBeGreaterThanOrEqual(0);
	} finally {
		server.stop(true);
	}
});

test('dist fingerprint changes when bundle files change', async () => {
	const {distDir} = createLoopFixture();
	const before = await computeDistFingerprint(distDir);
	writeFileSync(path.join(distDir, 'chunk.js'), 'export {};\n');
	const after = await computeDistFingerprint(distDir);
	expect(after).not.toBe(before);
});

test('watch detects dist changes and re-runs audit', async () => {
	const {testRoot, distDir} = createLoopFixture();
	let auditRuns = 0;
	const loop = new NetworkLoop({
		domainId: 'com.example.watch',
		projectRoot: testRoot,
		distPath: distDir,
		watch: true,
		watchInterval: 50,
		scanPatterns: async () => {
			auditRuns += 1;
			return [];
		},
		checkPackageVersions: async () => [],
	});

	await loop.start();
	expect(auditRuns).toBe(1);

	writeFileSync(path.join(distDir, 'updated.js'), 'export const v = 2;\n');
	const deadline = Date.now() + 2_000;
	while (auditRuns < 2 && Date.now() < deadline) {
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	loop.stop();
	expect(auditRuns).toBeGreaterThanOrEqual(2);
});

test('fail on health invokes failure handler for degraded probes', async () => {
	const {testRoot, distDir} = createLoopFixture();
	let failureCalls = 0;
	const loop = new NetworkLoop({
		domainId: 'com.example.health',
		projectRoot: testRoot,
		distPath: distDir,
		healthUrl: 'http://127.0.0.1:1/unreachable',
		failOnHealth: true,
		scanPatterns: async () => [],
		checkPackageVersions: async () => [],
		onHealthFailure: () => {
			failureCalls += 1;
		},
	});

	await loop.auditNow();
	expect(failureCalls).toBe(1);
});
