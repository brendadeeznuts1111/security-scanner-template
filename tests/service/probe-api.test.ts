import {afterEach, expect, test} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {
	resolveAllEndpointProbeTargets,
	scanDomainEndpointProbes,
} from '../../src/intel/endpoint-scan.ts';
import {
	ENDPOINT_PROBE_CATALOG_PATH,
	ENDPOINT_PROBE_META_PATH,
	handleEndpointProbeApi,
} from '../../src/service/probe-api.ts';

let server: ReturnType<typeof Bun.serve> | null = null;

afterEach(() => {
	server?.stop(true);
	server = null;
});

test('probe api catalog lists merged endpoint targets', async () => {
	const secureHeaders = {
		'X-Content-Type-Options': 'nosniff',
		'Content-Security-Policy': "default-src 'self'",
	};
	const upstream = Bun.serve({
		port: 0,
		fetch(req) {
			const url = new URL(req.url);
			if (url.pathname === '/meta') {
				return Response.json({ok: true}, {headers: secureHeaders});
			}
			if (url.pathname === '/health') {
				return new Response('ok', {headers: secureHeaders});
			}
			return new Response('missing', {status: 404});
		},
	});

	const healthUrl = `http://127.0.0.1:${upstream.port}/health`;
	const metaUrl = `http://127.0.0.1:${upstream.port}/meta`;
	const config = applyDefaults({
		domain: 'com.example.probe-api',
		intel: {
			endpoints: [{url: metaUrl, label: 'meta', expectStatus: 200}],
		},
	});

	const ctx = {
		listTargets: () =>
			resolveAllEndpointProbeTargets(config, null, {
				healthUrl,
				bundleNetwork: {
					raw: 1,
					unique: 1,
					endpoints: ['/meta'],
					healthRoutes: [],
					hits: [],
				},
			}),
		runProbes: () =>
			scanDomainEndpointProbes({
				root: process.cwd(),
				domain: config.domain,
				config,
				policy: null,
				healthUrl,
				bundleNetwork: {
					raw: 1,
					unique: 1,
					endpoints: ['/meta'],
					healthRoutes: [],
					hits: [],
				},
			}),
	};

	server = Bun.serve({
		port: 0,
		fetch: async req =>
			(await handleEndpointProbeApi(req, ctx)) ?? new Response('nope', {status: 404}),
	});

	try {
		const catalog = await fetch(`http://127.0.0.1:${server.port}${ENDPOINT_PROBE_CATALOG_PATH}`);
		expect(catalog.status).toBe(200);
		const body = (await catalog.json()) as {count: number; targets: {url: string}[]};
		expect(body.count).toBeGreaterThanOrEqual(2);
		expect(body.targets.map(t => t.url)).toContain(metaUrl);

		const report = await fetch(`http://127.0.0.1:${server.port}${ENDPOINT_PROBE_META_PATH}`);
		expect(report.status).toBe(200);
		const probe = (await report.json()) as {probed: number; results: {ok: boolean}[]};
		expect(probe.probed).toBeGreaterThanOrEqual(2);
		expect(probe.results.some(r => r.ok)).toBe(true);
	} finally {
		upstream.stop(true);
	}
});
