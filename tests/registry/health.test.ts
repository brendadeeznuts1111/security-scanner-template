import {expect, test} from 'bun:test';
import {$} from 'bun';
import {setupEnvCleanup, startRegistryServer, srcIndexPath} from '../helpers.ts';

setupEnvCleanup();

test('--check-registry succeeds when registry is reachable and bearer token is accepted', async () => {
	const {server, url} = startRegistryServer(200, 'OK', 'Bearer good-token');
	const scriptPath = `/tmp/scanner-check-registry-ok-${crypto.randomUUID()}.ts`;
	const errPath = `/tmp/scanner-check-registry-ok-err-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		await import('${srcIndexPath}');
		`,
	);

	try {
		await $`bun run ${scriptPath} --check-registry --registry-url ${url} 2> ${errPath}`
			.env({...process.env, NPM_CONFIG_TOKEN: 'good-token'})
			.quiet();
		const stderr = await Bun.file(errPath).text();
		expect(stderr).toContain('registry reachable');
		expect(stderr).toContain('bearer token accepted');
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(errPath)
			.delete()
			.catch(() => {});
		server.stop(true);
	}
});

test('--check-registry succeeds when registry is reachable and basic auth is accepted', async () => {
	const expectedAuth = `Basic ${Buffer.from('good-user:good-pass').toString('base64')}`;
	const {server, url} = startRegistryServer(200, 'OK', expectedAuth);
	const scriptPath = `/tmp/scanner-check-registry-basic-${crypto.randomUUID()}.ts`;
	const errPath = `/tmp/scanner-check-registry-basic-err-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		await import('${srcIndexPath}');
		`,
	);

	try {
		await $`bun run ${scriptPath} --check-registry --registry-url ${url} --registry-auth-type basic --registry-username good-user --registry-password good-pass 2> ${errPath}`.quiet();
		const stderr = await Bun.file(errPath).text();
		expect(stderr).toContain('registry reachable');
		expect(stderr).toContain('basic auth accepted');
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(errPath)
			.delete()
			.catch(() => {});
		server.stop(true);
	}
});

test('--check-registry exits with error when registry rejects the bearer token', async () => {
	const {server, url} = startRegistryServer(200, 'OK', 'Bearer good-token');
	const scriptPath = `/tmp/scanner-check-registry-auth-${crypto.randomUUID()}.ts`;
	const errPath = `/tmp/scanner-check-registry-auth-err-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		await import('${srcIndexPath}');
		`,
	);

	try {
		await $`bun run ${scriptPath} --check-registry --registry-url ${url} 2> ${errPath}`
			.env({...process.env, NPM_CONFIG_TOKEN: 'bad-token'})
			.quiet();
		expect(true).toBe(false);
	} catch {
		const stderr = await Bun.file(errPath).text();
		expect(stderr).toContain('401 Unauthorized');
		expect(stderr).toContain('provided bearer token was rejected');
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(errPath)
			.delete()
			.catch(() => {});
		server.stop(true);
	}
});

test('--check-registry exits with error when registry URL is unreachable', async () => {
	const scriptPath = `/tmp/scanner-check-registry-down-${crypto.randomUUID()}.ts`;
	const errPath = `/tmp/scanner-check-registry-down-err-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		await import('${srcIndexPath}');
		`,
	);

	try {
		await $`bun run ${scriptPath} --check-registry --registry-url http://localhost:1 2> ${errPath}`.quiet();
		expect(true).toBe(false);
	} catch {
		const stderr = await Bun.file(errPath).text();
		expect(stderr).toContain('registry check failed');
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(errPath)
			.delete()
			.catch(() => {});
	}
});
