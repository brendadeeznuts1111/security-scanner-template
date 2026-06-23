import {expect, test, beforeEach, afterEach} from 'bun:test';
import {
	runVaultDoctor,
	runVaultGet,
	runVaultSet,
	runVaultStatus,
	type VaultCliOptions,
} from '../../src/cli/vault-commands.ts';
import {SCANNER_DOMAIN} from '../../src/domains/registry.ts';

interface BackendState {
	store: Record<string, string>;
	set: Array<{service: string; name: string; value: string; allowUnrestrictedAccess?: boolean}>;
}

let state: BackendState;
let originalSecrets: typeof Bun.secrets;
let originalExit: typeof process.exit;
let exitCode: number | null;
let stdout: string[];
let stderr: string[];

beforeEach(() => {
	state = {store: {}, set: []};
	originalSecrets = Bun.secrets;
	originalExit = process.exit;
	exitCode = null;
	stdout = [];
	stderr = [];

	const mockConsole = {
		log: (...args: unknown[]) => stdout.push(args.join(' ')),
		error: (...args: unknown[]) => stderr.push(args.join(' ')),
	};
	(globalThis as unknown as {console: typeof console}).console =
		mockConsole as unknown as typeof console;

	process.exit = ((code?: number) => {
		exitCode = code ?? 0;
		throw new Error(`EXIT:${code}`);
	}) as typeof process.exit;

	const mockSecrets = {
		get: async (opts: {service: string; name: string}) => {
			return state.store[`${opts.service}/${opts.name}`] ?? null;
		},
		set: async (opts: {
			service: string;
			name: string;
			value: string;
			allowUnrestrictedAccess?: boolean;
		}) => {
			state.set.push(opts);
			state.store[`${opts.service}/${opts.name}`] = opts.value;
		},
		delete: async (opts: {service: string; name: string}) => {
			const key = `${opts.service}/${opts.name}`;
			const existed = key in state.store;
			delete state.store[key];
			return existed;
		},
	};
	(Bun as unknown as {secrets: unknown}).secrets = mockSecrets;
});

afterEach(() => {
	(Bun as unknown as {secrets: unknown}).secrets = originalSecrets;
	process.exit = originalExit;
	(globalThis as unknown as {console: typeof console}).console = console;
});

async function capture<T>(
	fn: () => Promise<T>,
): Promise<{result?: T; error?: Error; exit: number | null}> {
	try {
		const result = await fn();
		return {result, exit: exitCode};
	} catch (error) {
		return {error: error instanceof Error ? error : new Error(String(error)), exit: exitCode};
	}
}

test('runVaultStatus prints status for domain', async () => {
	state.store[`${SCANNER_DOMAIN}/threat-feed-token`] = 'token';
	const outcome = await capture(() => runVaultStatus({json: true, domain: SCANNER_DOMAIN}));
	expect(outcome.exit).toBeNull();
	expect(stdout.length).toBe(1);
	const parsed = JSON.parse(stdout[0] ?? '{}');
	expect(parsed.domain).toBe(SCANNER_DOMAIN);
	expect(
		parsed.status.some(
			(s: {name: string; exists: boolean}) => s.name === 'threat-feed-token' && s.exists,
		),
	).toBe(true);
});

test('runVaultSet stores a secret from --value', async () => {
	const outcome = await capture(() =>
		runVaultSet({name: 'threat-feed-token', value: 'secret-token', domain: SCANNER_DOMAIN}),
	);
	expect(outcome.exit).toBeNull();
	expect(state.store[`${SCANNER_DOMAIN}/threat-feed-token`]).toBe('secret-token');
	expect(state.set[0]?.allowUnrestrictedAccess).toBe(false);
});

test('runVaultGet prints a stored secret', async () => {
	state.store[`${SCANNER_DOMAIN}/threat-feed-token`] = 'secret-token';
	const outcome = await capture(() =>
		runVaultGet({name: 'threat-feed-token', domain: SCANNER_DOMAIN}),
	);
	expect(outcome.exit).toBeNull();
	expect(stdout).toEqual(['secret-token']);
});

test('runVaultDoctor reports missing required secrets', async () => {
	const outcome = await capture(() => runVaultDoctor({json: true, domain: SCANNER_DOMAIN}));
	expect(outcome.exit).toBe(0);
	const parsed = JSON.parse(stdout[0] ?? '{}');
	expect(parsed.ok).toBe(true);
	expect(parsed.rows.length).toBeGreaterThan(0);
});
