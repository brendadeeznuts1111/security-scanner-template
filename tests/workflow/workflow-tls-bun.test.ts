import {expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, writeFileSync} from 'fs';
import path from 'path';
import {tmpdir} from 'os';
import {buildWorkflowAlertPayload} from '../../src/workflow/effects/index.ts';
import {aggregateWorkflowReport, formatWorkflowMarkdown} from '../../src/workflow/output.ts';
import {collectWorkflowBunMetadata} from '../../src/workflow/runtime-context.ts';
import {
	bunSeedState,
	buildWorkflowSeedDocument,
	computeWorkflowSeedDrift,
} from '../../src/workflow/seed.ts';
import {createWorkflowFetch, resolveWorkflowTlsOptions} from '../../src/workflow/tls-fetch.ts';
import type {ScannerResult} from '../../src/workflow/types.ts';

test('collectWorkflowBunMetadata captures version, revision, and platform', () => {
	const bun = collectWorkflowBunMetadata();
	expect(bun.version).toBe(Bun.version);
	expect(bun.platform.length).toBeGreaterThan(0);
	expect(typeof bun.isDebug).toBe('boolean');
});

test('buildWorkflowAlertPayload includes bun metadata by default', () => {
	const bun = collectWorkflowBunMetadata();
	const report = aggregateWorkflowReport('com.example.tls', [], undefined, bun);
	const payload = buildWorkflowAlertPayload(report);
	expect(payload.bun?.version).toBe(Bun.version);
});

test('computeWorkflowSeedDrift detects bun.runtime drift', () => {
	const seed = buildWorkflowSeedDocument('com.example.tls', [], {
		version: '1.0.0',
		revision: 'abc12345',
		platform: 'darwin',
		isDebug: false,
	});
	const drift = computeWorkflowSeedDrift([], seed, {
		bun: {
			version: '1.1.0',
			revision: 'def67890',
			platform: 'darwin',
			isDebug: false,
		},
	});
	expect(drift['bun.runtime']).toBeDefined();
	expect(drift['bun.runtime']?.actual.version).toBe('1.1.0');
});

test('resolveWorkflowTlsOptions reads PEM files from disk', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'workflow-tls-'));
	const caPath = path.join(root, 'ca.pem');
	writeFileSync(caPath, '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n');
	const resolved = await resolveWorkflowTlsOptions({ca: caPath}, root);
	expect(resolved?.ca).toContain('BEGIN CERTIFICATE');
});

test('createWorkflowFetch attaches tls options to fetch init', async () => {
	let capturedTls: unknown;
	const fetchFn = createWorkflowFetch(
		{rejectUnauthorized: false, ca: 'test-ca'},
		async (_url, init) => {
			capturedTls = (init as {tls?: unknown})?.tls;
			return new Response('ok', {status: 200});
		},
	);
	await fetchFn('https://hooks.example.test/alert');
	expect(capturedTls).toEqual({rejectUnauthorized: false, ca: 'test-ca'});
});

test('formatWorkflowMarkdown includes Bun runtime line', () => {
	const results: ScannerResult[] = [
		{
			scannerId: 'semver',
			domain: 'com.example.tls',
			timestamp: '2026-06-23T00:00:00.000Z',
			status: 'pass',
			issues: [],
		},
	];
	const report = aggregateWorkflowReport('com.example.tls', results, undefined, {
		version: '1.2.3',
		revision: 'deadbeef',
		platform: 'linux',
		isDebug: false,
	});
	const markdown = formatWorkflowMarkdown(report);
	expect(markdown).toContain('Bun 1.2.3');
	expect(markdown).toContain('linux');
});

test('bunSeedState is stable for drift comparisons', () => {
	const state = bunSeedState({
		version: '1.2.3',
		revision: 'abc',
		platform: 'darwin',
		isDebug: true,
	});
	expect(state.version).toBe('1.2.3');
	expect(state.isDebug).toBe(true);
});
