import {expect, test, beforeEach, afterEach} from 'bun:test';
import {createVaultDomain, VaultDomain} from '../../src/domains/vault.ts';
import {SCANNER_DOMAIN} from '../../src/domains/registry.ts';

interface BackendState {
	get: Array<{service: string; name: string}>;
	set: Array<{service: string; name: string; value: string; allowUnrestrictedAccess?: boolean}>;
	deleted: Array<{service: string; name: string}>;
	store: Record<string, string>;
}

let state: BackendState;
let originalSecrets: typeof Bun.secrets;
let vault: VaultDomain;

beforeEach(() => {
	state = {get: [], set: [], deleted: [], store: {}};
	originalSecrets = Bun.secrets;

	const mockSecrets = {
		get: async (opts: {service: string; name: string}) => {
			state.get.push(opts);
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
			state.deleted.push(opts);
			const key = `${opts.service}/${opts.name}`;
			const existed = key in state.store;
			delete state.store[key];
			return existed;
		},
	};

	(Bun as unknown as {secrets: unknown}).secrets = mockSecrets;
	vault = createVaultDomain(SCANNER_DOMAIN);
});

afterEach(() => {
	(Bun as unknown as {secrets: unknown}).secrets = originalSecrets;
});

test('get returns stored secret', async () => {
	state.store[`${SCANNER_DOMAIN}/threat-feed-token`] = 'my-token';
	const value = await vault.get('threat-feed-token');
	expect(value).toBe('my-token');
	expect(state.get).toEqual([{service: SCANNER_DOMAIN, name: 'threat-feed-token'}]);
});

test('get returns empty string for missing optional secret', async () => {
	const value = await vault.get('threat-feed-token');
	expect(value).toBe('');
});

test('set stores secret with correct service/name', async () => {
	await vault.set('threat-feed-token', 'my-token');
	expect(state.store[`${SCANNER_DOMAIN}/threat-feed-token`]).toBe('my-token');
	expect(state.set[0]?.allowUnrestrictedAccess).toBe(false);
});

test('delete removes stored secret', async () => {
	state.store[`${SCANNER_DOMAIN}/threat-feed-token`] = 'my-token';
	const deleted = await vault.delete('threat-feed-token');
	expect(deleted).toBe(true);
	expect(state.store[`${SCANNER_DOMAIN}/threat-feed-token`]).toBeUndefined();
});

test('delete returns false for missing secret', async () => {
	const deleted = await vault.delete('threat-feed-token');
	expect(deleted).toBe(false);
});

test('status reports all registered secrets', async () => {
	state.store[`${SCANNER_DOMAIN}/threat-feed-token`] = 'my-token';
	const status = await vault.status();
	expect(status).toContainEqual({name: 'threat-feed-token', exists: true, required: false});
});
