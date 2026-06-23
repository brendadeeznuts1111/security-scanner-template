import {expect, test} from 'bun:test';
import {collectEndpointDoctorIssues} from '../../src/intel/endpoint-scan.ts';
import {probeEndpointMeta, scanEndpointMetaProbes} from '../../src/intel/endpoint-probe.ts';
import {applyDefaults} from '../../src/config/defaults.ts';
import {extractEndpointProbesFromToml} from '../../src/policy/endpoints.ts';

test('policy toml intel.endpoints section parses into probe targets', () => {
	const probes = extractEndpointProbesFromToml({
		intel: {
			endpoints: [
				{url: 'http://localhost/meta', label: 'meta', expectStatus: 200},
				{url: 'http://localhost/health', method: 'HEAD'},
			],
		},
	});
	expect(probes).toHaveLength(2);
	expect(probes[0]?.label).toBe('meta');
	expect(probes[1]?.method).toBe('HEAD');
});

test('endpoint meta probe collects status, headers, and preview', async () => {
	const server = Bun.serve({
		port: 0,
		fetch(req) {
			const url = new URL(req.url);
			if (url.pathname === '/meta') {
				return Response.json(
					{service: 'scanner', version: '1.0.0'},
					{
						headers: {
							'X-Content-Type-Options': 'nosniff',
							'Content-Security-Policy': "default-src 'self'",
						},
					},
				);
			}
			return new Response('not found', {status: 404});
		},
	});

	try {
		const result = await probeEndpointMeta({
			url: `http://127.0.0.1:${server.port}/meta`,
			label: 'meta',
			expectStatus: 200,
			requireHeaders: ['x-content-type-options'],
		});
		expect(result.ok).toBe(true);
		expect(result.status).toBe(200);
		expect(result.metaPreview).toContain('scanner');
		expect(result.headers['x-content-type-options']).toBe('nosniff');
	} finally {
		server.stop(true);
	}
});

test('endpoint meta probe flags leaks and missing headers', async () => {
	const server = Bun.serve({
		port: 0,
		fetch: () =>
			Response.json(
				{apiKey: 'super-secret-key-value-12345'},
				{headers: {'Content-Type': 'application/json'}},
			),
	});

	try {
		const result = await probeEndpointMeta({
			url: `http://127.0.0.1:${server.port}/meta`,
			expectStatus: 200,
			requireHeaders: ['x-content-type-options'],
		});
		expect(result.ok).toBe(false);
		expect(result.violations.some(v => v.kind === 'meta-leak')).toBe(true);
		expect(result.violations.some(v => v.kind === 'header-missing')).toBe(true);
	} finally {
		server.stop(true);
	}
});

test('doctor reports endpoint probe failures', async () => {
	const server = Bun.serve({
		port: 0,
		fetch: () => new Response('ok', {status: 503}),
	});

	try {
		const config = applyDefaults({
			domain: 'com.example.probe',
			intel: {
				endpoints: [{url: `http://127.0.0.1:${server.port}/meta`, label: 'meta', expectStatus: 200}],
			},
		});
		const issues = await collectEndpointDoctorIssues(
			process.cwd(),
			config.domain,
			'domains/example.json5',
			config,
			null,
		);
		expect(issues.some(i => i.code === 'ENDPOINT_PROBE')).toBe(true);
	} finally {
		server.stop(true);
	}
});

test('endpoint meta scan aggregates probe violations', async () => {
	const server = Bun.serve({
		port: 0,
		fetch: () => new Response('ok', {status: 503}),
	});

	try {
		const report = await scanEndpointMetaProbes({
			root: process.cwd(),
			targets: [
				{
					url: `http://127.0.0.1:${server.port}/health`,
					expectStatus: 200,
				},
			],
		});
		expect(report.probed).toBe(1);
		expect(report.violations.some(v => v.kind === 'status-mismatch')).toBe(true);
	} finally {
		server.stop(true);
	}
});