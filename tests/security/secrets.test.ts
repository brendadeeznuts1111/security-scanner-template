import {expect, test} from 'bun:test';
import {scanner} from '../../src/index.ts';
import {setupEnvCleanup, packageFixture, withSecretsGet} from '../helpers.ts';

setupEnvCleanup();

test('send Bearer token from Bun.secrets when THREAT_FEED_TOKEN_NAME is set', async () => {
	const state: {auth: string | null} = {auth: null};
	const server = Bun.serve({
		port: 0,
		fetch: req => {
			state.auth = req.headers.get('authorization');
			return new Response(
				JSON.stringify([
					{
						package: 'authed-pkg',
						range: '1.0.0',
						url: 'https://example.com/authed-pkg',
						description: 'Requires auth to fetch',
						categories: ['malware'],
					},
				]),
				{headers: {'Content-Type': 'application/json'}},
			);
		},
	});

	process.env.THREAT_FEED_URL = `http://localhost:${server.port}`;
	process.env.THREAT_FEED_TOKEN_NAME = 'threat-feed-token';

	const restore = withSecretsGet(async () => 'test-secret-token');

	try {
		const advisories = await scanner.scan({
			packages: [packageFixture('authed-pkg', '1.0.0')],
		});

		expect(state.auth).toBe('Bearer test-secret-token');
		expect(advisories).toMatchObject([{package: 'authed-pkg', level: 'fatal'}]);
	} finally {
		restore();
		server.stop(true);
	}
});

test('pass the configured service/name to Bun.secrets.get', async () => {
	const state: {captured: {service: string; name: string} | null} = {captured: null};
	const server = Bun.serve({
		port: 0,
		fetch: () =>
			new Response(JSON.stringify([]), {
				headers: {'Content-Type': 'application/json'},
			}),
	});

	process.env.THREAT_FEED_URL = `http://localhost:${server.port}`;
	process.env.THREAT_FEED_TOKEN_SERVICE = 'my-cli-tool';
	process.env.THREAT_FEED_TOKEN_NAME = 'github-token';

	const restore = withSecretsGet(async opts => {
		state.captured = opts;
		return 'tok';
	});

	try {
		await scanner.scan({packages: []});
		expect(state.captured).toEqual({service: 'my-cli-tool', name: 'github-token'});
	} finally {
		restore();
		server.stop(true);
	}
});

test('not call Bun.secrets when THREAT_FEED_TOKEN_NAME is unset', async () => {
	let calls = 0;
	const server = Bun.serve({
		port: 0,
		fetch: () =>
			new Response(JSON.stringify([]), {
				headers: {'Content-Type': 'application/json'},
			}),
	});

	process.env.THREAT_FEED_URL = `http://localhost:${server.port}`;
	// THREAT_FEED_TOKEN_NAME deliberately left unset.

	const restore = withSecretsGet(async () => {
		calls++;
		return 'should-not-be-called';
	});

	try {
		await scanner.scan({packages: []});
		expect(calls).toBe(0);
	} finally {
		restore();
		server.stop(true);
	}
});

test('proceed unauthenticated when Bun.secrets.get returns null', async () => {
	const state: {auth: string | null} = {auth: null};
	const server = Bun.serve({
		port: 0,
		fetch: req => {
			state.auth = req.headers.get('authorization');
			return new Response(
				JSON.stringify([
					{
						package: 'no-token-pkg',
						range: '1.0.0',
						url: null,
						description: null,
						categories: ['malware'],
					},
				]),
				{headers: {'Content-Type': 'application/json'}},
			);
		},
	});

	process.env.THREAT_FEED_URL = `http://localhost:${server.port}`;
	process.env.THREAT_FEED_TOKEN_NAME = 'missing-token';

	const restore = withSecretsGet(async () => null);

	try {
		const advisories = await scanner.scan({
			packages: [packageFixture('no-token-pkg', '1.0.0')],
		});
		expect(state.auth).toBeNull();
		expect(advisories).toMatchObject([{package: 'no-token-pkg', level: 'fatal'}]);
	} finally {
		restore();
		server.stop(true);
	}
});

test('proceed unauthenticated when Bun.secrets.get throws', async () => {
	const state: {auth: string | null} = {auth: null};
	const server = Bun.serve({
		port: 0,
		fetch: req => {
			state.auth = req.headers.get('authorization');
			return new Response(JSON.stringify([]), {
				headers: {'Content-Type': 'application/json'},
			});
		},
	});

	process.env.THREAT_FEED_URL = `http://localhost:${server.port}`;
	process.env.THREAT_FEED_TOKEN_NAME = 'broken-token';

	const restore = withSecretsGet(async opts => {
		// Let the backend-availability probe succeed, but fail the actual token lookup.
		if (opts.name === 'broken-token') {
			throw new Error('keychain unavailable');
		}
		return null;
	});

	try {
		await scanner.scan({packages: []});
		expect(state.auth).toBeNull();
	} finally {
		restore();
		server.stop(true);
	}
});
