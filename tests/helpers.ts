import {beforeEach, afterEach} from 'bun:test';

export const ENV_VARS_TO_CLEAN = [
	'THREAT_FEED_URL',
	'THREAT_FEED_PATH',
	'THREAT_FEED_TIMEOUT_MS',
	'THREAT_FEED_RETRIES',
	'THREAT_FEED_TOKEN_SERVICE',
	'THREAT_FEED_TOKEN_NAME',
	'THREAT_FEED_TOKEN_PROVIDER',
	'THREAT_FEED_TOKEN',
	'THREAT_FEED_CACHE_TTL',
	'SCANNER_LOG_PATH',
	'SCANNER_LOG_STDERR',
];

export function cleanupEnv() {
	for (const key of ENV_VARS_TO_CLEAN) {
		delete process.env[key];
	}
}

export function setupEnvCleanup() {
	beforeEach(cleanupEnv);
	afterEach(cleanupEnv);
}

export const srcIndexPath = new URL('../src/index.ts', import.meta.url).pathname;

export function startFeedServer(response: unknown) {
	const server = Bun.serve({
		port: 0,
		fetch: () =>
			new Response(JSON.stringify(response), {
				headers: {'Content-Type': 'application/json'},
			}),
	});

	return {server, url: `http://localhost:${server.port}`};
}

export function startFeedServerWithCounter(
	state: {requests: number},
	response: unknown,
	{status = 200, statusText = 'OK'}: {status?: number; statusText?: string} = {},
) {
	const server = Bun.serve({
		port: 0,
		fetch: () => {
			state.requests++;
			return new Response(JSON.stringify(response), {
				status,
				statusText,
				headers: {'Content-Type': 'application/json'},
			});
		},
	});

	return {server, url: `http://localhost:${server.port}`};
}

export function packageFixture(
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

export async function writeTempFile(contents: string): Promise<string> {
	const path = `/tmp/scanner-test-${Date.now()}.json`;
	await Bun.write(path, contents);
	return path;
}

export async function sha256Hex(input: string): Promise<string> {
	const hasher = new Bun.CryptoHasher('sha256');
	hasher.update(input);
	return hasher.digest('hex');
}

export function startTarballServer(contents: string) {
	const server = Bun.serve({
		port: 0,
		fetch: () =>
			new Response(contents, {
				headers: {'Content-Type': 'application/gzip'},
			}),
	});

	return {server, url: `http://localhost:${server.port}`};
}

export async function readLines(path: string): Promise<string[]> {
	const text = await Bun.file(path).text();
	return text
		.split('\n')
		.map(line => line.trim())
		.filter(line => line.length > 0);
}

export function withSecretsGet(
	impl: (opts: {service: string; name: string}) => Promise<string | null>,
) {
	const original = Bun.secrets;
	(Bun as unknown as {secrets: unknown}).secrets = {get: impl};
	return () => {
		(Bun as unknown as {secrets: unknown}).secrets = original;
	};
}

export function startRegistryServer(status: number, body: string, expectedAuth?: string) {
	const server = Bun.serve({
		port: 0,
		fetch: req => {
			if (expectedAuth !== undefined) {
				const auth = req.headers.get('authorization');
				if (auth !== expectedAuth) {
					return new Response('Unauthorized', {status: 401});
				}
			}
			return new Response(body, {status});
		},
	});
	return {server, url: `http://localhost:${server.port}`};
}
