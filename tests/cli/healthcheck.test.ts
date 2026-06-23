import {expect, test} from 'bun:test';
import {$} from 'bun';
import {setupEnvCleanup, startFeedServer, startRegistryServer, srcIndexPath} from '../helpers.ts';

setupEnvCleanup();

function parseHealth(stdout: string): unknown {
	return JSON.parse(stdout);
}

test('--healthcheck prints JSON status and exits 0 when defaults are healthy', async () => {
	const {server: registryServer, url: registryUrl} = startRegistryServer(200, 'OK');

	try {
		const result = await $`bun run ${srcIndexPath} --healthcheck --registry-url ${registryUrl}`
			.env({
				...process.env,
				THREAT_FEED_TOKEN_PROVIDER: 'env',
			})
			.nothrow()
			.quiet();

		const status = parseHealth(result.stdout.toString()) as {
			threatFeed: {configured: boolean; source: string; reachable: boolean};
			secretsBackend: {provider: string; configured: boolean; available: boolean};
			registry: {configured: boolean; url: string; reachable: boolean};
			allHealthy: boolean;
		};

		expect(status.threatFeed.configured).toBe(true);
		expect(status.threatFeed.source).toBe('default');
		expect(status.threatFeed.reachable).toBe(true);
		expect(status.secretsBackend.provider).toBe('env');
		expect(status.secretsBackend.configured).toBe(false);
		expect(status.secretsBackend.available).toBe(true);
		expect(status.registry.configured).toBe(true);
		expect(status.registry.url).toBe(registryUrl);
		expect(status.registry.reachable).toBe(true);
		expect(status.allHealthy).toBe(true);
		expect(result.exitCode).toBe(0);
	} finally {
		registryServer.stop(true);
	}
});

test('--healthcheck reports env token as configured when THREAT_FEED_TOKEN is set', async () => {
	const {server: registryServer, url: registryUrl} = startRegistryServer(200, 'OK');

	try {
		const result = await $`bun run ${srcIndexPath} --healthcheck --registry-url ${registryUrl}`
			.env({
				...process.env,
				THREAT_FEED_TOKEN_PROVIDER: 'env',
				THREAT_FEED_TOKEN: 'env-token-value',
			})
			.nothrow()
			.quiet();

		const status = parseHealth(result.stdout.toString()) as {
			secretsBackend: {provider: string; configured: boolean; available: boolean};
			allHealthy: boolean;
		};

		expect(status.secretsBackend.provider).toBe('env');
		expect(status.secretsBackend.configured).toBe(true);
		expect(status.secretsBackend.available).toBe(true);
		expect(status.allHealthy).toBe(true);
		expect(result.exitCode).toBe(0);
	} finally {
		registryServer.stop(true);
	}
});

test('--healthcheck reports remote threat feed reachability', async () => {
	const {server: feedServer, url: feedUrl} = startFeedServer([]);
	const {server: registryServer, url: registryUrl} = startRegistryServer(200, 'OK');

	try {
		const result =
			await $`bun run ${srcIndexPath} --healthcheck --threat-feed-url ${feedUrl} --registry-url ${registryUrl}`
				.env({
					...process.env,
					THREAT_FEED_TOKEN_PROVIDER: 'env',
				})
				.nothrow()
				.quiet();

		const status = parseHealth(result.stdout.toString()) as {
			threatFeed: {source: string; url: string; reachable: boolean};
			allHealthy: boolean;
		};

		expect(status.threatFeed.source).toBe('remote');
		expect(status.threatFeed.url).toBe(feedUrl);
		expect(status.threatFeed.reachable).toBe(true);
		expect(status.allHealthy).toBe(true);
		expect(result.exitCode).toBe(0);
	} finally {
		feedServer.stop(true);
		registryServer.stop(true);
	}
});

test('--healthcheck reports unreachable threat feed as unhealthy', async () => {
	const result = await $`bun run ${srcIndexPath} --healthcheck --threat-feed-url http://localhost:1`
		.env({
			...process.env,
			THREAT_FEED_TOKEN_PROVIDER: 'env',
		})
		.nothrow()
		.quiet();

	const status = parseHealth(result.stdout.toString()) as {
		threatFeed: {reachable: boolean; error: string};
		allHealthy: boolean;
	};

	expect(status.threatFeed.reachable).toBe(false);
	expect(status.threatFeed.error).toBeTruthy();
	expect(status.allHealthy).toBe(false);
	expect(result.exitCode).not.toBe(0);
});

test('--healthcheck shows live spinner progress when stderr is a TTY', async () => {
	const {server: registryServer, url: registryUrl} = startRegistryServer(200, 'OK');
	const scriptPath = `/tmp/scanner-healthcheck-tty-${crypto.randomUUID()}.ts`;
	const errPath = `/tmp/scanner-healthcheck-tty-err-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		(process.stderr as unknown as {isTTY: boolean}).isTTY = true;
		await import('${srcIndexPath}');
		`,
	);

	try {
		const result =
			await $`bun run ${scriptPath} --healthcheck --registry-url ${registryUrl} 2> ${errPath}`
				.env({
					...process.env,
					THREAT_FEED_TOKEN_PROVIDER: 'env',
				})
				.nothrow()
				.quiet();

		const stderr = await Bun.file(errPath).text();
		expect(stderr).toContain('Running health checks');
		expect(stderr).toContain('🔍 Threat feed');
		expect(stderr).toContain('🔐 Secrets backend');
		expect(stderr).toContain('📦 Registry');
		expect(stderr).toContain('✅');

		const status = parseHealth(result.stdout.toString()) as {allHealthy: boolean};
		expect(status.allHealthy).toBe(true);
		expect(result.exitCode).toBe(0);
	} finally {
		registryServer.stop(true);
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(errPath)
			.delete()
			.catch(() => {});
	}
});

test('--healthcheck reports bun-secrets backend as unavailable when OS store is broken', async () => {
	const scriptPath = `/tmp/scanner-healthcheck-broken-backend-${crypto.randomUUID()}.ts`;

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
		await import('${srcIndexPath}');
		`,
	);

	try {
		const result = await $`bun run ${scriptPath} --healthcheck`
			.env({
				...process.env,
				THREAT_FEED_TOKEN_PROVIDER: 'bun-secrets',
				THREAT_FEED_TOKEN_NAME: 'test-token',
			})
			.nothrow()
			.quiet();

		const status = parseHealth(result.stdout.toString()) as {
			secretsBackend: {
				provider: string;
				configured: boolean;
				available: boolean;
				error?: string;
			};
			allHealthy: boolean;
		};

		expect(status.secretsBackend.provider).toBe('bun-secrets');
		expect(status.secretsBackend.configured).toBe(false);
		expect(status.secretsBackend.available).toBe(false);
		expect(status.secretsBackend.error).toMatch(/OS credential store did not respond/);
		expect(status.allHealthy).toBe(false);
		expect(result.exitCode).not.toBe(0);
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
	}
});
