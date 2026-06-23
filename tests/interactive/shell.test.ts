import {expect, test, beforeEach, afterEach} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import type {DomainRegistry} from '../../src/config/registry.ts';
import type {DomainConfig} from '../../src/config/types.ts';
import {SecurityShell} from '../../src/interactive/shell.ts';
import {Registry} from '../../src/registry/index.ts';
import {TLSInspector} from '../../src/intel/tls/inspector.ts';
import {clearSystemCACache} from '../../src/intel/tls/system-ca.ts';
import {MASTER_TOKEN_SECRET} from '../../src/visual/qr-cache.ts';

function testRegistry(configs: DomainConfig[]): DomainRegistry {
	const byDomain = new Map(configs.map(config => [config.domain, config]));

	return {
		async loadAll() {},
		get(domain: string) {
			const config = byDomain.get(domain);
			if (!config) throw new Error(`Unknown domain: ${domain}`);
			return config;
		},
		has(domain: string) {
			return byDomain.has(domain);
		},
		list() {
			return Array.from(byDomain.keys()).sort();
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

let originalSpawn: typeof Bun.spawn;

beforeEach(() => {
	originalSpawn = Bun.spawn;
});

afterEach(() => {
	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = originalSpawn;
});

test('SecurityShell help documents tls command', async () => {
	const output: string[] = [];
	const originalWrite = process.stdout.write.bind(process.stdout);
	process.stdout.write = ((chunk: string | Uint8Array) => {
		output.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
		return true;
	}) as typeof process.stdout.write;

	const shell = new SecurityShell(testRegistry([]), {
		lines: ['help', 'exit'],
	});

	try {
		await shell.start();
	} finally {
		process.stdout.write = originalWrite;
	}

	const joined = output.join('');
	expect(joined).toContain('tls --host');
	expect(joined).toContain('--use-system-ca');
});

test('SecurityShell tls prints scan summary for active domain', async () => {
	clearSystemCACache();

	const config = applyDefaults({
		domain: 'com.example.shell-tls',
		csrf: {enabled: false, tokenLength: 32},
	});

	const original = TLSInspector.inspect;
	TLSInspector.inspect = async (host, port = 443) => ({
		host,
		port,
		protocol: 'TLSv1.3',
		alpn: 'h2',
		validatedWithSystemCA: false,
		certificate: {
			subject: {CN: host},
			issuer: {CN: 'Test CA'},
			validFrom: 'Jan  1 00:00:00 2026 GMT',
			validTo: 'Jan  1 00:00:00 2027 GMT',
			fingerprint: 'aa:bb:cc',
			serialNumber: '1',
			daysRemaining: 300,
			expired: false,
			selfSigned: false,
		},
	});

	const output: string[] = [];
	const originalWrite = process.stdout.write.bind(process.stdout);
	process.stdout.write = ((chunk: string | Uint8Array) => {
		output.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
		return true;
	}) as typeof process.stdout.write;

	const shell = new SecurityShell(testRegistry([config]), {
		domain: config.domain,
		lines: ['tls --host scan.example.com', 'exit'],
	});

	try {
		await shell.start();
	} finally {
		process.stdout.write = originalWrite;
		TLSInspector.inspect = original;
	}

	const joined = output.join('');
	expect(joined).toContain('scan.example.com:443');
	expect(joined).toContain('TLSv1.3');
	expect(joined).not.toContain('error:');
});

test('SecurityShell help documents domain QR modes', async () => {
	const output: string[] = [];
	const originalWrite = process.stdout.write.bind(process.stdout);
	process.stdout.write = ((chunk: string | Uint8Array) => {
		output.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
		return true;
	}) as typeof process.stdout.write;

	const shell = new SecurityShell(testRegistry([]), {
		lines: ['help', 'exit'],
	});

	try {
		await shell.start();
	} finally {
		process.stdout.write = originalWrite;
	}

	const joined = output.join('');
	expect(joined).toContain('--terminal');
	expect(joined).toContain('--format svg|png|webp');
	expect(joined).toContain('--dark');
});

test('SecurityShell qr renders domain master token in terminal', async () => {
	const config = applyDefaults({
		domain: 'com.example.shell-qr',
		secrets: {service: 'com.example.shell-qr', inventory: []},
		csrf: {enabled: false, tokenLength: 32},
	});

	await Bun.secrets.set({
		service: 'com.example.shell-qr',
		name: MASTER_TOKEN_SECRET,
		value: 'shell-qr-token',
	});

	const output: string[] = [];
	const originalWrite = process.stdout.write.bind(process.stdout);
	process.stdout.write = ((chunk: string | Uint8Array) => {
		output.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
		return true;
	}) as typeof process.stdout.write;

	const shell = new SecurityShell(testRegistry([config]), {
		domain: config.domain,
		lines: ['qr', 'exit'],
	});

	try {
		await shell.start();
	} finally {
		process.stdout.write = originalWrite;
	}

	const joined = output.join('');
	expect(joined).toContain('Bun Security Scanner REPL');
	expect(joined).not.toContain('error:');
	expect(joined.replace(/\s/g, '').length).toBeGreaterThan(80);
});

test('SecurityShell runs help and features commands then exits', async () => {
	const config = applyDefaults({
		domain: 'com.example.shell',
		service: {interactive: true},
		csrf: {enabled: false, tokenLength: 32},
	});

	const shell = new SecurityShell(testRegistry([config]), {
		domain: config.domain,
		lines: ['help', 'features', 'exit'],
	});

	const output: string[] = [];
	const originalWrite = process.stdout.write.bind(process.stdout);
	process.stdout.write = ((chunk: string | Uint8Array) => {
		output.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
		return true;
	}) as typeof process.stdout.write;

	try {
		await shell.start();
	} finally {
		process.stdout.write = originalWrite;
	}

	const joined = output.join('');
	expect(joined).toContain('Bun Security Scanner REPL');
	expect(joined).toContain('Commands:');
	expect(joined).toContain('AUDIT_SQLITE');
});

test('SecurityShell sets domain context', async () => {
	const config = applyDefaults({
		domain: 'com.example.alpha',
		service: {interactive: true},
		csrf: {enabled: false, tokenLength: 32},
	});

	const shell = new SecurityShell(testRegistry([config]), {
		lines: ['domain com.example.alpha', 'exit'],
	});

	await shell.start();
	expect(shell.activeDomain).toBe('com.example.alpha');
});

test('SecurityShell lists deployment profiles', async () => {
	const output: string[] = [];
	const originalWrite = process.stdout.write.bind(process.stdout);
	process.stdout.write = ((chunk: string | Uint8Array) => {
		output.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
		return true;
	}) as typeof process.stdout.write;

	const shell = new SecurityShell(testRegistry([]), {
		lines: ['profiles', 'exit'],
	});

	try {
		await shell.start();
	} finally {
		process.stdout.write = originalWrite;
	}

	const joined = output.join('');
	expect(joined).toContain('agent:');
	expect(joined).toContain('SCAN_EXTERNAL');
});

test('SecurityShell buildProfile invokes bun build with profile features', async () => {
	const spawnCalls: string[][] = [];

	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = ((
		cmd: string | string[],
		_opts?: unknown,
	) => {
		const args = Array.isArray(cmd) ? cmd : [cmd];
		spawnCalls.push(args);
		return {exited: Promise.resolve(0)} as ReturnType<typeof Bun.spawn>;
	}) as typeof Bun.spawn;

	const shell = new SecurityShell(testRegistry([]), {
		lines: ['build --profile agent', 'exit'],
		outdir: 'dist-test',
		entry: 'src/index.ts',
	});

	await shell.start();

	expect(spawnCalls.length).toBe(1);
	const args = spawnCalls[0] ?? [];
	expect(args[0]).toBe('bun');
	expect(args[1]).toBe('build');
	expect(args.join(' ')).toContain('--outdir=dist-test/agent');
	expect(args.join(' ')).toContain('--feature=AUDIT_JSONL');
	expect(args.join(' ')).toContain('--feature=SCAN_EXTERNAL');
	expect(args.join(' ')).not.toContain('--feature=AUDIT_SQLITE');
});

test('Registry exposes build profiles and profile feature lists', () => {
	const registry = new Registry();
	expect(registry.buildProfiles().agent).toContain('SCAN_EXTERNAL');
	expect(registry.featuresForProfile('server')).toContain('CACHE_REDIS');
	expect(registry.describeProfile('dev')).toContain('development');
});
