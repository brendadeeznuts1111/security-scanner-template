import {expect, test, beforeEach, afterEach} from 'bun:test';
import {mkdtemp, rm} from 'fs/promises';
import path from 'path';
import os from 'node:os';
import {applyDefaults} from '../../src/config/defaults.ts';
import type {DomainRegistry} from '../../src/config/registry.ts';
import type {DomainConfig} from '../../src/config/types.ts';
import {SecurityShell} from '../../src/interactive/shell.ts';
import {DEFAULT_MASTER_KEY_NAME} from '../../src/config/master-key.ts';

let cacheRoot = '';
let originalSecrets: typeof Bun.secrets;

function testRegistry(config: DomainConfig): DomainRegistry {
	return {
		async loadAll() {},
		get(domain: string) {
			if (domain !== config.domain) throw new Error(`Unknown domain: ${domain}`);
			return config;
		},
		has(domain: string) {
			return domain === config.domain;
		},
		list() {
			return [config.domain];
		},
		async security() {
			throw new Error('not used');
		},
		async service() {
			throw new Error('not used');
		},
		watch() {},
		unwatch() {},
		async reloadDomain() {
			return null;
		},
	};
}

beforeEach(async () => {
	cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'shell-qr-'));
	process.env.QR_CACHE_DIR = cacheRoot;

	originalSecrets = Bun.secrets;
	const store: Record<string, string> = {};
	(Bun as unknown as {secrets: unknown}).secrets = {
		get: async (opts: {service: string; name: string}) =>
			store[`${opts.service}/${opts.name}`] ?? null,
		set: async (opts: {service: string; name: string; value: string}) => {
			store[`${opts.service}/${opts.name}`] = opts.value;
		},
		delete: async () => false,
	};
});

afterEach(async () => {
	delete process.env.QR_CACHE_DIR;
	await rm(cacheRoot, {recursive: true, force: true}).catch(() => {});
	(Bun as unknown as {secrets: unknown}).secrets = originalSecrets;
});

test('SecurityShell qr --terminal renders domain master token QR', async () => {
	const config = applyDefaults({
		domain: 'com.example.shell-qr',
		secrets: {service: 'com.example.shell-qr', inventory: []},
		csrf: {enabled: false, tokenLength: 32},
	});

	await Bun.secrets.set({
		service: 'com.example.shell-qr',
		name: DEFAULT_MASTER_KEY_NAME,
		value: 'shell-token',
	});

	const output: string[] = [];
	const originalWrite = process.stdout.write.bind(process.stdout);
	process.stdout.write = ((chunk: string | Uint8Array) => {
		output.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
		return true;
	}) as typeof process.stdout.write;

	const shell = new SecurityShell(testRegistry(config), {
		domain: config.domain,
		lines: ['qr --terminal', 'exit'],
	});

	try {
		await shell.start();
	} finally {
		process.stdout.write = originalWrite;
	}

	const joined = output.join('');
	expect(joined.length).toBeGreaterThan(10);
});
