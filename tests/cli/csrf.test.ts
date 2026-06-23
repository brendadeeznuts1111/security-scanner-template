import {expect, test, beforeEach, afterEach} from 'bun:test';
import {createVaultDomain} from '../../src/domains/vault.ts';
import {SCANNER_DOMAIN} from '../../src/domains/registry.ts';

let originalSecrets: typeof Bun.secrets;
const DOMAIN = SCANNER_DOMAIN;

beforeEach(() => {
	originalSecrets = Bun.secrets;
	const store: Record<string, string> = {};

	(Bun as unknown as {secrets: unknown}).secrets = {
		get: async (opts: {service: string; name: string}) =>
			store[`${opts.service}/${opts.name}`] ?? null,
		set: async (opts: {service: string; name: string; value: string}) => {
			store[`${opts.service}/${opts.name}`] = opts.value;
		},
		delete: async (opts: {service: string; name: string}) => {
			const key = `${opts.service}/${opts.name}`;
			const existed = key in store;
			delete store[key];
			return existed;
		},
	};
});

afterEach(() => {
	(Bun as unknown as {secrets: unknown}).secrets = originalSecrets;
});

test('rotate stores a new csrf-secret in the vault', async () => {
	const vault = createVaultDomain(DOMAIN);
	await vault.set('csrf-secret', 'old-secret');

	const newSecret = Bun.randomUUIDv7();
	await vault.set('csrf-secret', newSecret);

	const stored = await vault.get('csrf-secret');
	expect(stored).toBe(newSecret);
	expect(stored).not.toBe('old-secret');
});