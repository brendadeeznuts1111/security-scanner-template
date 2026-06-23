import {afterEach, beforeEach, setSystemTime} from 'bun:test';
import {mkdir, rm, writeFile} from 'fs/promises';
import {tmpdir} from 'os';
import path from 'path';

let isolatedDirCounter = 0;

/** Stable ISO timestamp for deterministic assertions (2026-06-23 noon UTC). */
export const FIXED_TEST_ISO = '2026-06-23T12:00:00.000Z';
export const FIXED_TEST_DATE = new Date(FIXED_TEST_ISO);
export const FIXED_TEST_MS = FIXED_TEST_DATE.getTime();

/**
 * Reset mocked system time after each test.
 * @see https://bun.com/reference/bun/test/setSystemTime
 * @see https://bun.com/docs/test/writing-tests#timeouts
 */
export function resetSystemTime(): void {
	setSystemTime();
}

/** Freeze `Date.now` / `new Date()` for the current test. */
export function freezeSystemTime(at: Date | string = FIXED_TEST_ISO): void {
	setSystemTime(typeof at === 'string' ? new Date(at) : at);
}

export function setupTimeCleanup(): void {
	afterEach(() => {
		setSystemTime();
	});
}

/** Run fn with frozen clock, then restore real time. */
export async function withFixedSystemTime<T>(
	fn: () => Promise<T> | T,
	at: Date | string = FIXED_TEST_ISO,
): Promise<T> {
	freezeSystemTime(at);
	try {
		return await fn();
	} finally {
		resetSystemTime();
	}
}

/** Unique temp directory safe for concurrent `bun:test` runs. */
export function isolatedTestDir(prefix: string): string {
	isolatedDirCounter += 1;
	return path.join(
		tmpdir(),
		`${prefix}-${Date.now()}-${isolatedDirCounter}-${Math.random().toString(36).slice(2)}`,
	);
}

/** Create an isolated directory, run fn, then remove it. */
export async function withTestDir<T>(
	prefix: string,
	fn: (dir: string) => Promise<T> | T,
): Promise<T> {
	const dir = isolatedTestDir(prefix);
	await mkdir(dir, {recursive: true});
	try {
		return await fn(dir);
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
}

/** Write a file under `root`, creating parent directories as needed. */
export async function writeFileInDir(
	root: string,
	relativePath: string,
	contents: string,
): Promise<string> {
	const fullPath = path.join(root, relativePath);
	await mkdir(path.dirname(fullPath), {recursive: true});
	await writeFile(fullPath, contents);
	return fullPath;
}

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
	const filePath = path.join(isolatedTestDir('scanner-test'), 'fixture.json');
	await mkdir(path.dirname(filePath), {recursive: true});
	await Bun.write(filePath, contents);
	return filePath;
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
