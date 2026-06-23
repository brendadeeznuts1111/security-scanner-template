import {expect, test, beforeEach, afterEach} from 'bun:test';
import {applyDefaults, deepMerge} from '../../src/config/defaults.ts';
import {discoverDomainFiles, loadDomainFile} from '../../src/config/loader.ts';
import {encryptInventory} from '../../src/config/vault.ts';

const TEST_DIR = `/tmp/config-loader-test-${Date.now()}`;

beforeEach(async () => {
	await Bun.write(TEST_DIR, '').catch(() => {});
	const {rm, mkdir} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
	await mkdir(TEST_DIR, {recursive: true});
	await mkdir(`${TEST_DIR}/domains`, {recursive: true});
});

afterEach(async () => {
	const {rm} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
});

async function writeDomain(name: string, contents: string): Promise<void> {
	await Bun.write(`${TEST_DIR}/domains/${name}.security.json5`, contents);
}

test('applyDefaults requires a domain field', () => {
	expect(() => applyDefaults({})).toThrow('Domain config must have a `domain` string');
});

test('applyDefaults fills in missing fields', () => {
	const config = applyDefaults({domain: 'com.example.test'});
	expect(config.domain).toBe('com.example.test');
	expect(config.colors.primary).toBe('#0A84FF');
	expect(config.secrets.service).toBe('com.example.test');
	expect(config.supplyChain.policy.fatal).toContain('malware');
});

test('deepMerge prefers source values', () => {
	const merged = deepMerge(
		{a: 1, b: {c: 2}} as unknown as Record<string, unknown>,
		{b: {d: 3}} as unknown,
	);
	expect(merged).toEqual({a: 1, b: {c: 2, d: 3}});
});

test('discoverDomainFiles finds domain files', async () => {
	await writeDomain('ledger', '{ domain: "com.example.ledger" }');
	await writeDomain('peptex', '{ domain: "com.example.peptex" }');

	const files = discoverDomainFiles(TEST_DIR);
	expect(files.length).toBe(2);
});

test('loadDomainFile parses JSON5 and applies defaults', async () => {
	await writeDomain(
		'ledger',
		`{
			domain: "com.example.ledger",
			colors: { primary: "#00FF00" }
		}`,
	);

	const loaded = await loadDomainFile(`${TEST_DIR}/domains/ledger.security.json5`);
	expect(loaded.domain).toBe('com.example.ledger');
	expect(loaded.config.colors.primary).toBe('#00FF00');
	expect(loaded.config.colors.fatal).toBe('#FF453A');
});

test('applyDefaults merges inventory by name', () => {
	const config = applyDefaults({
		domain: 'com.example.test',
		secrets: {
			inventory: [
				{name: 'shared-key', required: true, description: 'Overridden'},
				{name: 'new-key', required: false, description: 'Added'},
			],
		},
	});

	expect(config.secrets.inventory).toContainEqual({
		name: 'new-key',
		required: false,
		description: 'Added',
	});
	expect(config.secrets.inventory.find(s => s.name === 'shared-key')?.description).toBe(
		'Overridden',
	);
});

test('applyDefaults replaces policy arrays', () => {
	const config = applyDefaults({
		domain: 'com.example.test',
		supplyChain: {
			policy: {
				fatal: ['malware'],
				warn: ['protestware'],
			},
		},
	});

	expect(config.supplyChain.policy.fatal).toEqual(['malware']);
	expect(config.supplyChain.policy.warn).toEqual(['protestware']);
	expect(config.supplyChain.policy.fatal).not.toContain('backdoor');
});

test('applyDefaults merges errorOverrides by code', () => {
	const config = applyDefaults({
		domain: 'com.example.test',
		errorOverrides: {
			VAULT_MISSING: {severity: 'warn', channel: 'vault'},
		},
	});

	expect(config.errorOverrides.VAULT_MISSING).toEqual({severity: 'warn', channel: 'vault'});
});

test('loadDomainFile loads encrypted inventory from inventoryFile', async () => {
	const originalKey = process.env.VAULT_MASTER_KEY;
	process.env.VAULT_MASTER_KEY = 'test-key';
	try {
		const inventory = [{name: 'from-file', required: true, description: 'Loaded from file'}];
		const envelope = await encryptInventory(inventory, 'test-key');
		await Bun.write(
			`${TEST_DIR}/.vault/test.inventory.json5.enc`,
			JSON.stringify(envelope, null, 2),
		);

		await writeDomain(
			'vaulted',
			`{
				domain: "com.example.vaulted",
				secrets: { inventoryFile: "../.vault/test.inventory.json5.enc" }
			}`,
		);

		const loaded = await loadDomainFile(`${TEST_DIR}/domains/vaulted.security.json5`);
		expect(loaded.config.secrets.inventory.length).toBe(1);
		expect(loaded.config.secrets.inventory[0]?.name).toBe('from-file');
	} finally {
		process.env.VAULT_MASTER_KEY = originalKey;
	}
});
