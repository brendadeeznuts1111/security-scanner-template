import {expect, test, beforeEach, afterEach} from 'bun:test';
import {$} from 'bun';
import {scanner, scannerCapabilities} from './src/index.ts';

/////////////////////////////////////////////////////////////////////////////////////
//  This test file is mostly just here to get you up and running quickly. It's
//  likely you'd want to improve or remove this, and add more coverage for your
//  own code.
/////////////////////////////////////////////////////////////////////////////////////

beforeEach(() => {
	delete process.env.THREAT_FEED_URL;
	delete process.env.THREAT_FEED_PATH;
	delete process.env.THREAT_FEED_TIMEOUT_MS;
	delete process.env.THREAT_FEED_RETRIES;
	delete process.env.THREAT_FEED_TOKEN_SERVICE;
	delete process.env.THREAT_FEED_TOKEN_NAME;
	delete process.env.SCANNER_LOG_PATH;
	delete process.env.SCANNER_LOG_STDERR;
});

afterEach(() => {
	delete process.env.THREAT_FEED_URL;
	delete process.env.THREAT_FEED_PATH;
	delete process.env.THREAT_FEED_TIMEOUT_MS;
	delete process.env.THREAT_FEED_RETRIES;
	delete process.env.THREAT_FEED_TOKEN_SERVICE;
	delete process.env.THREAT_FEED_TOKEN_NAME;
	delete process.env.SCANNER_LOG_PATH;
	delete process.env.SCANNER_LOG_STDERR;
});

function startFeedServer(response: unknown) {
	const server = Bun.serve({
		port: 0,
		fetch: () =>
			new Response(JSON.stringify(response), {
				headers: {'Content-Type': 'application/json'},
			}),
	});

	return {server, url: `http://localhost:${server.port}`};
}

function packageFixture(
	name: string,
	version: string,
	requestedRange: string = version,
): Bun.Security.Package {
	return {
		name,
		version,
		requestedRange,
		tarball: `https://registry.npmjs.org/${name}/-/${name.replace('@', '').replace('/', '-')}-${version}.tgz`,
	};
}

test('Scanner should warn about known malicious packages', async () => {
	const advisories = await scanner.scan({
		packages: [
			packageFixture(
				'event-stream',
				'3.3.6', // This was a known incident in 2018 - https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident
				'^3.3.0',
			),
		],
	});

	expect(advisories.length).toBeGreaterThan(0);
	const advisory = advisories[0]!;
	expect(advisory).toBeDefined();

	expect(advisory).toMatchObject({
		level: 'fatal',
		package: 'event-stream',
		url: expect.any(String),
		description: expect.any(String),
	});
});

test('There should be no advisories if no packages are being installed', async () => {
	const advisories = await scanner.scan({packages: []});
	expect(advisories.length).toBe(0);
});

test('Safe packages should return no advisories', async () => {
	const advisories = await scanner.scan({
		packages: [packageFixture('lodash', '4.17.21', '^4.17.0')],
	});
	expect(advisories.length).toBe(0);
});

test('Should handle multiple packages with mixed security status', async () => {
	const advisories = await scanner.scan({
		packages: [
			packageFixture('event-stream', '3.3.6', '^3.3.0'), // malicious
			packageFixture('lodash', '4.17.21', '^4.17.0'), // safe
		],
	});

	expect(advisories.length).toBe(1);
	expect(advisories[0]?.package).toBe('event-stream');
});

test('Should differentiate between versions of the same package', async () => {
	const maliciousVersion = await scanner.scan({
		packages: [packageFixture('event-stream', '3.3.6', '3.3.6')],
	});

	const safeVersion = await scanner.scan({
		packages: [packageFixture('event-stream', '4.0.0', '4.0.0')],
	});

	expect(maliciousVersion.length).toBeGreaterThan(0);
	expect(safeVersion.length).toBe(0);
});

test('Should handle scoped packages correctly', async () => {
	const advisories = await scanner.scan({
		packages: [packageFixture('@types/node', '20.0.0', '^20.0.0')],
	});

	expect(advisories.length).toBe(0);
});

test('Should warn about protestware and adware', async () => {
	const {server, url} = startFeedServer([
		{
			package: 'protest-pkg',
			range: '1.0.0',
			url: 'https://example.com/protest-pkg',
			description: 'Protestware',
			categories: ['protestware'],
		},
		{
			package: 'adware-pkg',
			range: '>=2.0.0 <3.0.0',
			url: 'https://example.com/adware-pkg',
			description: 'Adware',
			categories: ['adware'],
		},
	]);
	process.env.THREAT_FEED_URL = url;

	const protestware = await scanner.scan({
		packages: [packageFixture('protest-pkg', '1.0.0')],
	});
	const adware = await scanner.scan({
		packages: [packageFixture('adware-pkg', '2.5.0', '^2.0.0')],
	});

	expect(protestware).toMatchObject([{level: 'warn', package: 'protest-pkg'}]);
	expect(adware).toMatchObject([{level: 'warn', package: 'adware-pkg'}]);

	server.stop(true);
});

test('Should warn about deprecated packages', async () => {
	const {server, url} = startFeedServer([
		{
			package: 'deprecated-pkg',
			range: '<=2.0.0',
			url: 'https://example.com/deprecated-pkg',
			description: 'This package is deprecated',
			categories: ['deprecated'],
		},
	]);
	process.env.THREAT_FEED_URL = url;

	const advisories = await scanner.scan({
		packages: [packageFixture('deprecated-pkg', '1.5.0', '^1.0.0')],
	});

	expect(advisories).toMatchObject([
		{
			level: 'warn',
			package: 'deprecated-pkg',
			url: 'https://example.com/deprecated-pkg',
			description: 'This package is deprecated',
		},
	]);

	server.stop(true);
});

test('Should ignore unknown threat categories', async () => {
	const {server, url} = startFeedServer([
		{
			package: 'unknown-cat-pkg',
			range: '1.0.0',
			url: null,
			description: null,
			categories: ['protestware', 'adware', 'backdoor', 'malware', 'botnet'],
		},
	]);
	process.env.THREAT_FEED_URL = url;

	const advisories = await scanner.scan({
		packages: [packageFixture('unknown-cat-pkg', '1.0.0')],
	});

	expect(advisories.length).toBe(1);
	expect(advisories[0]?.level).toBe('fatal');

	server.stop(true);
});

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
		packages: [packageFixture('remote-pkg', '1.0.0')],
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

async function writeTempFile(contents: string): Promise<string> {
	const path = `/tmp/scanner-test-${Date.now()}.json`;
	await Bun.write(path, contents);
	return path;
}

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
		packages: [packageFixture('local-pkg', '1.0.0')],
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

async function sha256Hex(input: string): Promise<string> {
	const hasher = new Bun.CryptoHasher('sha256');
	hasher.update(input);
	return hasher.digest('hex');
}

function startTarballServer(contents: string) {
	const server = Bun.serve({
		port: 0,
		fetch: () =>
			new Response(contents, {
				headers: {'Content-Type': 'application/gzip'},
			}),
	});

	return {server, url: `http://localhost:${server.port}`};
}

test('Should block packages by tarball hash', async () => {
	const tarballContents = 'mock tarball contents';
	const blockedHash = await sha256Hex(tarballContents);

	const {server: tarballServer, url: tarballUrl} = startTarballServer(tarballContents);
	const {server: feedServer, url: feedUrl} = startFeedServer([
		{
			package: 'hashed-pkg',
			range: '1.0.0',
			url: 'https://example.com/hashed-pkg',
			description: 'Package with known bad hash',
			categories: ['malware'],
			hashes: [blockedHash],
		},
	]);
	process.env.THREAT_FEED_URL = feedUrl;

	const advisories = await scanner.scan({
		packages: [
			{
				name: 'hashed-pkg',
				version: '1.0.0',
				requestedRange: '1.0.0',
				tarball: tarballUrl,
			},
		],
	});

	expect(advisories).toMatchObject([
		{
			level: 'fatal',
			package: 'hashed-pkg',
		},
	]);

	tarballServer.stop(true);
	feedServer.stop(true);
});

test('Should ignore threats when tarball hash does not match blocklist', async () => {
	const tarballContents = 'safe tarball contents';
	const {server: tarballServer, url: tarballUrl} = startTarballServer(tarballContents);
	const {server: feedServer, url: feedUrl} = startFeedServer([
		{
			package: 'safe-hashed-pkg',
			range: '1.0.0',
			url: 'https://example.com/safe-hashed-pkg',
			description: 'Package with known bad hash',
			categories: ['malware'],
			hashes: ['0000000000000000000000000000000000000000000000000000000000000000'],
		},
	]);
	process.env.THREAT_FEED_URL = feedUrl;

	const advisories = await scanner.scan({
		packages: [
			{
				name: 'safe-hashed-pkg',
				version: '1.0.0',
				requestedRange: '1.0.0',
				tarball: tarballUrl,
			},
		],
	});

	expect(advisories.length).toBe(0);

	tarballServer.stop(true);
	feedServer.stop(true);
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

test('Should expose scanner capabilities', () => {
	expect(scannerCapabilities).toMatchObject({
		version: '1.0.0',
		apiVersion: '1',
		supports: expect.arrayContaining([
			'remote-threat-feed',
			'local-threat-feed',
			'stdin-threat-feed',
			'tarball-hash-verification',
			'timeout-and-retry',
			'zod-validation',
			'allowlist-policy',
			'structured-event-emission',
		]),
		categories: expect.arrayContaining(['protestware', 'adware', 'backdoor', 'malware', 'botnet']),
	});
});

test('Should load default rules from rules/security-rules.json', async () => {
	const rules = await Bun.file('./rules/security-rules.json').json();
	const eventStreamRule = rules.find((rule: any) => rule.package === 'event-stream');
	expect(eventStreamRule).toBeDefined();

	const advisories = await scanner.scan({
		packages: [packageFixture('event-stream', '3.3.6', '^3.3.0')],
	});

	expect(advisories).toMatchObject([
		{
			level: 'fatal',
			package: eventStreamRule.package,
			url: eventStreamRule.url,
			description: eventStreamRule.description,
		},
	]);
});

test('Should suppress threats for packages on the allowlist', async () => {
	const {server, url} = startFeedServer({
		rules: [
			{
				package: 'allowed-pkg',
				range: '1.0.0',
				url: 'https://example.com/allowed-pkg',
				description: 'Normally blocked',
				categories: ['malware'],
			},
		],
		allowlist: [{package: 'allowed-pkg', range: '1.0.0', reason: 'approved exception'}],
	});
	process.env.THREAT_FEED_URL = url;

	const advisories = await scanner.scan({
		packages: [packageFixture('allowed-pkg', '1.0.0')],
	});

	expect(advisories.length).toBe(0);

	server.stop(true);
});

test('Should not suppress non-allowlisted versions of an allowlisted package', async () => {
	const {server, url} = startFeedServer({
		rules: [
			{
				package: 'allowed-pkg',
				range: '<=2.0.0',
				url: 'https://example.com/allowed-pkg',
				description: 'Normally blocked',
				categories: ['malware'],
			},
		],
		allowlist: [{package: 'allowed-pkg', range: '1.0.0'}],
	});
	process.env.THREAT_FEED_URL = url;

	const allowed = await scanner.scan({
		packages: [packageFixture('allowed-pkg', '1.0.0')],
	});
	const blocked = await scanner.scan({
		packages: [packageFixture('allowed-pkg', '2.0.0')],
	});

	expect(allowed.length).toBe(0);
	expect(blocked).toMatchObject([{level: 'fatal', package: 'allowed-pkg'}]);

	server.stop(true);
});

async function readLines(path: string): Promise<string[]> {
	const text = await Bun.file(path).text();
	return text
		.split('\n')
		.map(line => line.trim())
		.filter(line => line.length > 0);
}

test('Should emit structured events to a log file', async () => {
	const logPath = `/tmp/scanner-events-${crypto.randomUUID()}.log`;
	process.env.SCANNER_LOG_PATH = logPath;

	const {server, url} = startFeedServer({
		rules: [
			{
				package: 'logged-pkg',
				range: '1.0.0',
				url: 'https://example.com/logged-pkg',
				description: 'Blocked for logging test',
				categories: ['malware'],
			},
		],
		allowlist: [{package: 'allowed-pkg', range: '1.0.0', reason: 'exception'}],
	});
	process.env.THREAT_FEED_URL = url;

	await scanner.scan({
		packages: [packageFixture('logged-pkg', '1.0.0'), packageFixture('allowed-pkg', '1.0.0')],
	});

	const lines = await readLines(logPath);
	expect(lines.length).toBeGreaterThanOrEqual(1);

	const events = lines.map(line => JSON.parse(line));
	expect(events).toEqual(
		expect.arrayContaining([
			expect.objectContaining({type: 'scan.start', packageCount: 2}),
			expect.objectContaining({
				type: 'feed.loaded',
				source: 'remote',
				ruleCount: 1,
				allowlistCount: 1,
			}),
			expect.objectContaining({
				type: 'threat.allowed',
				package: 'allowed-pkg',
				reason: 'exception',
			}),
			expect.objectContaining({type: 'threat.detected', level: 'fatal', package: 'logged-pkg'}),
			expect.objectContaining({type: 'scan.complete', advisoryCount: 1, allowedCount: 1}),
		]),
	);

	// scan.complete must be the final event so log consumers can detect the end of a scan.
	expect(events.at(-1)?.type).toBe('scan.complete');

	server.stop(true);
	await Bun.file(logPath)
		.delete()
		.catch(() => {});
});

test('Should accept --threat-feed-url CLI flag (overrides env var)', async () => {
	const {server: server1, url: url1} = startFeedServer([
		{
			package: 'cli-env-pkg',
			range: '1.0.0',
			url: 'https://example.com/cli-env',
			description: 'From env var',
			categories: ['malware'],
		},
	]);
	const {server: server2, url: url2} = startFeedServer([
		{
			package: 'cli-flag-pkg',
			range: '1.0.0',
			url: 'https://example.com/cli-flag',
			description: 'From CLI flag',
			categories: ['malware'],
		},
	]);

	// Spawn a subprocess that sets THREAT_FEED_URL to url1 but passes --threat-feed-url url2.
	// CLI flag should win.
	const scriptPath = `/tmp/scanner-cli-test-${crypto.randomUUID()}.ts`;
	await Bun.write(
		scriptPath,
		`
		import {scanner} from '${new URL('./src/index.ts', import.meta.url).pathname}';
		const advisories = await scanner.scan({
			packages: [{name: 'cli-flag-pkg', version: '1.0.0', requestedRange: '1.0.0', tarball: ''}],
		});
		console.log(JSON.stringify(advisories));
		`,
	);

	try {
		const lines: string[] = [];
		for await (const line of $`bun run ${scriptPath} --threat-feed-url ${url2}`
			.env({...process.env, THREAT_FEED_URL: url1})
			.lines()) {
			if (line.trim().length > 0) lines.push(line);
		}

		// The script's console.log is the last non-empty line of stdout.
		const advisories = JSON.parse(lines.at(-1)!);
		expect(advisories).toMatchObject([{package: 'cli-flag-pkg', level: 'fatal'}]);
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
	}

	server1.stop(true);
	server2.stop(true);
});

test('Should read threat feed from stdin via --threat-feed-stdin', async () => {
	const feedJson = JSON.stringify({
		rules: [
			{
				package: 'stdin-pkg',
				range: '1.0.0',
				url: 'https://example.com/stdin-pkg',
				description: 'Piped via stdin',
				categories: ['malware'],
			},
		],
	});

	const scriptPath = `/tmp/scanner-stdin-test-${crypto.randomUUID()}.ts`;
	await Bun.write(
		scriptPath,
		`
		import {scanner} from '${new URL('./src/index.ts', import.meta.url).pathname}';
		const advisories = await scanner.scan({
			packages: [{name: 'stdin-pkg', version: '1.0.0', requestedRange: '1.0.0', tarball: ''}],
		});
		console.log(JSON.stringify(advisories));
		`,
	);

	try {
		// Pipe the feed JSON into the subprocess via stdin using shell redirection.
		const lines: string[] = [];
		for await (const line of $`echo ${feedJson} | bun run ${scriptPath} --threat-feed-stdin`.lines()) {
			if (line.trim().length > 0) lines.push(line);
		}

		const advisories = JSON.parse(lines.at(-1)!);
		expect(advisories).toMatchObject([{package: 'stdin-pkg', level: 'fatal'}]);
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
	}
});

// --- Remote feed authentication via Bun.secrets ---
//
// Bun.secrets talks to the OS keychain, which we cannot rely on in tests.
// The `Bun.secrets` binding itself is writable (only its property descriptor
// is non-configurable), so tests swap the whole object for a stub and restore
// the original in `finally`. Production code calls `Bun.secrets.get` directly
// per https://bun.com/docs/runtime/secrets#api.

function withSecretsGet(impl: (opts: {service: string; name: string}) => Promise<string | null>) {
	const original = Bun.secrets;
	(Bun as unknown as {secrets: unknown}).secrets = {get: impl};
	return () => {
		(Bun as unknown as {secrets: unknown}).secrets = original;
	};
}

test('Should send Bearer token from Bun.secrets when THREAT_FEED_TOKEN_NAME is set', async () => {
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

test('Should pass the configured service/name to Bun.secrets.get', async () => {
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

test('Should not call Bun.secrets when THREAT_FEED_TOKEN_NAME is unset (no keychain access)', async () => {
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

test('Should proceed unauthenticated when Bun.secrets.get returns null', async () => {
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

test('Should proceed unauthenticated when Bun.secrets.get throws', async () => {
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

	const restore = withSecretsGet(async () => {
		throw new Error('keychain unavailable');
	});

	try {
		await scanner.scan({packages: []});
		expect(state.auth).toBeNull();
	} finally {
		restore();
		server.stop(true);
	}
});

// --- Token management CLI helpers (--store-token / --clear-token) ---
//
// These spawn the scanner as a subprocess so `import.meta.main` is true and
// the CLI helper block runs. Bun.secrets is stubbed by injecting a shim script
// that overrides Bun.secrets before importing the scanner.

test('--store-token stores the token via Bun.secrets.set', async () => {
	const scriptPath = `/tmp/scanner-store-token-test-${crypto.randomUUID()}.ts`;
	const outPath = `/tmp/scanner-store-token-out-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		const calls: {service: string; name: string; value: string}[] = [];
		(Bun as unknown as {secrets: unknown}).secrets = {
			get: async () => null,
			set: async (opts: {service: string; name: string; value: string}) => {
				calls.push(opts);
				await Bun.write('${outPath}', JSON.stringify(calls));
			},
			delete: async () => true,
		};
		await import('${new URL('./src/index.ts', import.meta.url).pathname}');
		`,
	);

	try {
		// --store-token-value avoids needing interactive prompt in the subprocess.
		await $`bun run ${scriptPath} --store-token --threat-feed-token-name my-token --store-token-value ghp_test123`
			.env({...process.env, THREAT_FEED_TOKEN_SERVICE: 'test-service'})
			.quiet();

		const calls = JSON.parse(await Bun.file(outPath).text());
		expect(calls).toEqual([{service: 'test-service', name: 'my-token', value: 'ghp_test123'}]);
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(outPath)
			.delete()
			.catch(() => {});
	}
});

test('--clear-token deletes the token via Bun.secrets.delete', async () => {
	const scriptPath = `/tmp/scanner-clear-token-test-${crypto.randomUUID()}.ts`;
	const outPath = `/tmp/scanner-clear-token-out-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		(Bun as unknown as {secrets: unknown}).secrets = {
			get: async () => null,
			set: async () => {},
			delete: async () => {
				await Bun.write('${outPath}', JSON.stringify({deleted: true}));
				return true;
			},
		};
		await import('${new URL('./src/index.ts', import.meta.url).pathname}');
		`,
	);

	try {
		await $`bun run ${scriptPath} --clear-token --threat-feed-token-name my-token`
			.env({...process.env, THREAT_FEED_TOKEN_SERVICE: 'test-service'})
			.quiet();

		const result = JSON.parse(await Bun.file(outPath).text());
		expect(result).toEqual({deleted: true});
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(outPath)
			.delete()
			.catch(() => {});
	}
});

test('--store-token without --threat-feed-token-name exits with error', async () => {
	const scriptPath = `/tmp/scanner-store-token-no-name-${crypto.randomUUID()}.ts`;

	await Bun.write(
		scriptPath,
		`
		(Bun as unknown as {secrets: unknown}).secrets = {
			get: async () => null,
			set: async () => {},
			delete: async () => true,
		};
		await import('${new URL('./src/index.ts', import.meta.url).pathname}');
		`,
	);

	try {
		const proc = $`bun run ${scriptPath} --store-token --store-token-value ghp_test`.quiet();
		await expect(proc).rejects.toThrow(); // non-zero exit
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
	}
});
