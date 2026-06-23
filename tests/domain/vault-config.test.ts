import {expect, test, beforeEach, afterEach} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {createConfigVault} from '../../src/domain/vault-config.ts';

let originalSecrets: typeof Bun.secrets;

beforeEach(() => {
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

afterEach(() => {
	(Bun as unknown as {secrets: unknown}).secrets = originalSecrets;
});

test('ConfigVault reads Bun.secrets using domain config service name', async () => {
	const config = applyDefaults({
		domain: 'com.example.vault',
		secrets: {
			service: 'com.example.vault',
			inventory: [{name: 'api-key', required: true, description: 'API key'}],
		},
		csrf: {enabled: false, tokenLength: 32},
	});

	await Bun.secrets.set({
		service: 'com.example.vault',
		name: 'api-key',
		value: 'secret-value',
	});

	const vault = createConfigVault(config);
	const status = await vault.status();
	expect(status).toEqual([
		{service: 'com.example.vault', name: 'api-key', exists: true, required: true},
	]);
});