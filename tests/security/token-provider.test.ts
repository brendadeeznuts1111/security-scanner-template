import {expect, test} from 'bun:test';
import {$} from 'bun';
import {scanner} from '../../src/index.ts';
import {setupEnvCleanup, packageFixture, withSecretsGet, srcIndexPath} from '../helpers.ts';

setupEnvCleanup();

function threatFeedServer(state: {auth: string | null}) {
	return Bun.serve({
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
}

test('bun-secrets provider is the default when provider is unset', async () => {
	const state: {auth: string | null} = {auth: null};
	const server = threatFeedServer(state);

	process.env.THREAT_FEED_URL = `http://localhost:${server.port}`;
	process.env.THREAT_FEED_TOKEN_NAME = 'default-provider-token';

	const restore = withSecretsGet(async () => 'default-secret-token');

	try {
		await scanner.scan({packages: [packageFixture('authed-pkg', '1.0.0')]});
		expect(state.auth).toBe('Bearer default-secret-token');
	} finally {
		restore();
		server.stop(true);
	}
});

test('bun-secrets provider is used when explicitly requested', async () => {
	const state: {auth: string | null} = {auth: null};
	const server = threatFeedServer(state);

	process.env.THREAT_FEED_URL = `http://localhost:${server.port}`;
	process.env.THREAT_FEED_TOKEN_PROVIDER = 'bun-secrets';
	process.env.THREAT_FEED_TOKEN_NAME = 'explicit-bun-secrets-token';

	const restore = withSecretsGet(async () => 'explicit-secret-token');

	try {
		await scanner.scan({packages: [packageFixture('authed-pkg', '1.0.0')]});
		expect(state.auth).toBe('Bearer explicit-secret-token');
	} finally {
		restore();
		server.stop(true);
	}
});

test('env provider sends the value from THREAT_FEED_TOKEN as Bearer token', async () => {
	const state: {auth: string | null} = {auth: null};
	const server = threatFeedServer(state);

	process.env.THREAT_FEED_URL = `http://localhost:${server.port}`;
	process.env.THREAT_FEED_TOKEN_PROVIDER = 'env';
	process.env.THREAT_FEED_TOKEN = 'env-secret-token';

	try {
		await scanner.scan({packages: [packageFixture('authed-pkg', '1.0.0')]});
		expect(state.auth).toBe('Bearer env-secret-token');
	} finally {
		server.stop(true);
	}
});

test('env provider degrades to unauthenticated when THREAT_FEED_TOKEN is unset', async () => {
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
	process.env.THREAT_FEED_TOKEN_PROVIDER = 'env';
	// THREAT_FEED_TOKEN deliberately left unset.

	try {
		await scanner.scan({packages: []});
		expect(state.auth).toBeNull();
	} finally {
		server.stop(true);
	}
});

test('unknown provider logs a warning and falls back to bun-secrets', async () => {
	const state: {auth: string | null} = {auth: null};
	const server = threatFeedServer(state);
	const errors: string[] = [];
	const originalError = console.error;

	process.env.THREAT_FEED_URL = `http://localhost:${server.port}`;
	process.env.THREAT_FEED_TOKEN_PROVIDER = 'unknown-provider';
	process.env.THREAT_FEED_TOKEN_NAME = 'fallback-token';

	const restore = withSecretsGet(async () => 'fallback-secret-token');

	console.error = (...args: unknown[]) => {
		errors.push(args.map(String).join(' '));
	};

	try {
		await scanner.scan({packages: [packageFixture('authed-pkg', '1.0.0')]});
		expect(state.auth).toBe('Bearer fallback-secret-token');
		expect(errors.some(msg => msg.includes('unknown token provider'))).toBe(true);
	} finally {
		console.error = originalError;
		restore();
		server.stop(true);
	}
});

test('bun-secrets provider fails loudly when the OS credential store is unavailable', async () => {
	const scriptPath = `/tmp/scanner-backend-unavailable-test-${crypto.randomUUID()}.ts`;

	await Bun.write(
		scriptPath,
		`
		(Bun as unknown as {secrets: unknown}).secrets = {
			get: async () => {
				throw new Error('no keychain daemon');
			},
			set: async () => {},
			delete: async () => true,
		};
		const {scanner} = await import('${srcIndexPath}');
		await scanner.scan({packages: []});
		`,
	);

	try {
		const result = await $`bun run ${scriptPath}`
			.env({
				...process.env,
				THREAT_FEED_URL: 'http://localhost:1',
				THREAT_FEED_TOKEN_NAME: 'test-token',
			})
			.nothrow()
			.quiet();
		const stderr = result.stderr.toString();
		expect(stderr).toContain(
			'bun-secrets provider is selected but the OS credential store is unreachable',
		);
		expect(stderr).toContain('THREAT_FEED_TOKEN_PROVIDER=env');
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
	}
});
