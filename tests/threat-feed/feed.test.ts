import {expect, test} from 'bun:test';
import {$} from 'bun';
import {scanner} from '../../src/index.ts';
import {
	setupEnvCleanup,
	startFeedServer,
	startFeedServerWithCounter,
	writeTempFile,
	srcIndexPath,
} from '../helpers.ts';

setupEnvCleanup();

test('Should use a configurable threat feed URL', async () => {
	const {server, url} = startFeedServer([
		{
			package: 'remote-pkg',
			range: '1.0.0',
			url: 'https://example.com/remote-pkg',
			description: 'Malicious remote package',
			categories: ['malware'],
		},
	]);
	process.env.THREAT_FEED_URL = url;

	const advisories = await scanner.scan({
		packages: [{name: 'remote-pkg', version: '1.0.0', requestedRange: '1.0.0', tarball: ''}],
	});

	expect(advisories).toMatchObject([
		{
			level: 'fatal',
			package: 'remote-pkg',
			url: 'https://example.com/remote-pkg',
			description: 'Malicious remote package',
		},
	]);

	server.stop(true);
});

test('Should load a local threat feed from a file path', async () => {
	const path = await writeTempFile(
		JSON.stringify([
			{
				package: 'local-pkg',
				range: '1.0.0',
				url: 'https://example.com/local-pkg',
				description: 'Malicious local package',
				categories: ['malware'],
			},
		]),
	);
	process.env.THREAT_FEED_PATH = path;

	const advisories = await scanner.scan({
		packages: [{name: 'local-pkg', version: '1.0.0', requestedRange: '1.0.0', tarball: ''}],
	});

	expect(advisories).toMatchObject([
		{
			level: 'fatal',
			package: 'local-pkg',
			url: 'https://example.com/local-pkg',
			description: 'Malicious local package',
		},
	]);

	await Bun.file(path)
		.delete()
		.catch(() => {});
});

test('Should load a threat feed from stdin via THREAT_FEED_STDIN', async () => {
	const feedJson = JSON.stringify({
		rules: [
			{
				package: 'stdin-env-pkg',
				range: '1.0.0',
				url: 'https://example.com/stdin-env-pkg',
				description: 'Piped via stdin',
				categories: ['malware'],
			},
		],
	});

	const scriptPath = `/tmp/scanner-stdin-env-test-${crypto.randomUUID()}.ts`;
	await Bun.write(
		scriptPath,
		`
		import {scanner} from '${srcIndexPath}';
		const advisories = await scanner.scan({
			packages: [{name: 'stdin-env-pkg', version: '1.0.0', requestedRange: '1.0.0', tarball: ''}],
		});
		console.log(JSON.stringify(advisories));
		`,
	);

	try {
		const lines: string[] = [];
		for await (const line of $`echo ${feedJson} | bun run ${scriptPath}`
			.env({...process.env, THREAT_FEED_STDIN: 'true'})
			.lines()) {
			if (line.trim().length > 0) lines.push(line);
		}

		const advisories = JSON.parse(lines.at(-1)!);
		expect(advisories).toMatchObject([{package: 'stdin-env-pkg', level: 'fatal'}]);
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
	}
});

test('Should throw when threat feed response is invalid', async () => {
	const {server, url} = startFeedServer({not: 'an array'});
	process.env.THREAT_FEED_URL = url;

	await expect(scanner.scan({packages: []})).rejects.toThrow();

	server.stop(true);
});

test('Should throw when threat feed request fails', async () => {
	const server = Bun.serve({
		port: 0,
		fetch: () => new Response('Internal Server Error', {status: 500}),
	});
	process.env.THREAT_FEED_URL = `http://localhost:${server.port}`;

	await expect(scanner.scan({packages: []})).rejects.toThrow();

	server.stop(true);
});

test('Should throw when remote threat feed times out', async () => {
	const server = Bun.serve({
		port: 0,
		fetch: () => new Promise<Response>(() => {}), // Never resolves
	});
	process.env.THREAT_FEED_URL = `http://localhost:${server.port}`;
	process.env.THREAT_FEED_TIMEOUT_MS = '50';
	process.env.THREAT_FEED_RETRIES = '0';

	await expect(scanner.scan({packages: []})).rejects.toThrow();

	server.stop(true);
});

test('Should cache remote threat feed and reuse it within TTL', async () => {
	const state: {requests: number} = {requests: 0};
	const {server, url} = startFeedServerWithCounter(state, [
		{
			package: 'cached-pkg',
			range: '1.0.0',
			url: 'https://example.com/cached-pkg',
			description: 'Cached remote package',
			categories: ['malware'],
		},
	]);
	const cacheDir = `/tmp/scanner-feed-cache-${crypto.randomUUID()}`;
	const scriptPath = `/tmp/scanner-feed-cache-test-${crypto.randomUUID()}.ts`;

	await Bun.write(
		scriptPath,
		`
		import {scanner} from '${srcIndexPath}';
		const advisories = await scanner.scan({
			packages: [{name: 'cached-pkg', version: '1.0.0', requestedRange: '1.0.0', tarball: ''}],
		});
		console.log(JSON.stringify(advisories));
		`,
	);

	try {
		await $`bun run ${scriptPath} --threat-feed-url ${url} --threat-feed-cache-ttl 60000`
			.env({...process.env, XDG_CACHE_HOME: cacheDir})
			.quiet();

		const stdout =
			await $`bun run ${scriptPath} --threat-feed-url ${url} --threat-feed-cache-ttl 60000`
				.env({...process.env, XDG_CACHE_HOME: cacheDir})
				.text();

		const advisories = JSON.parse(stdout) as Array<{package: string}>;
		expect(advisories).toMatchObject([{package: 'cached-pkg'}]);

		// The second scan used the cache and triggered a background refresh.
		// Wait for the refresh to finish, then verify the server was hit at
		// least twice (initial fetch + background refresh).
		await new Promise(resolve => setTimeout(resolve, 100));
		expect(state.requests).toBeGreaterThanOrEqual(2);
	} finally {
		server.stop(true);
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await $`rm -rf ${cacheDir}`.quiet().catch(() => {});
	}
});

test('Should refetch remote threat feed when cache is expired', async () => {
	const state: {requests: number} = {requests: 0};
	const {server, url} = startFeedServerWithCounter(state, [
		{
			package: 'expired-cache-pkg',
			range: '1.0.0',
			url: 'https://example.com/expired-cache-pkg',
			description: 'Expired cache package',
			categories: ['malware'],
		},
	]);
	const cacheDir = `/tmp/scanner-feed-cache-expired-${crypto.randomUUID()}`;
	const scriptPath = `/tmp/scanner-feed-cache-expired-test-${crypto.randomUUID()}.ts`;

	await Bun.write(
		scriptPath,
		`
		import {scanner} from '${srcIndexPath}';
		const advisories = await scanner.scan({
			packages: [{name: 'expired-cache-pkg', version: '1.0.0', requestedRange: '1.0.0', tarball: ''}],
		});
		console.log(JSON.stringify(advisories));
		`,
	);

	try {
		await $`bun run ${scriptPath} --threat-feed-url ${url} --threat-feed-cache-ttl 1`
			.env({...process.env, XDG_CACHE_HOME: cacheDir})
			.quiet();

		await new Promise(resolve => setTimeout(resolve, 50));

		await $`bun run ${scriptPath} --threat-feed-url ${url} --threat-feed-cache-ttl 1`
			.env({...process.env, XDG_CACHE_HOME: cacheDir})
			.quiet();

		expect(state.requests).toBe(2);
	} finally {
		server.stop(true);
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await $`rm -rf ${cacheDir}`.quiet().catch(() => {});
	}
});
