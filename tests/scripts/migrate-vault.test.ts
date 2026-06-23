import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'fs';
import path from 'path';
import {tmpdir} from 'os';
import {afterEach, beforeEach, expect, test} from 'bun:test';
import {checkAllDomains} from '../../src/config/doctor.ts';
import {loadEncryptedStore} from '../../src/config/encrypted-store.ts';
import {loadDomainFile} from '../../src/config/loader.ts';
import {getMasterKey} from '../../src/config/master-key.ts';
import {migrate} from '../../scripts/migrate-vault.ts';

const TEST_DIR = mkdtempSync(path.join(tmpdir(), 'migrate-vault-test-'));

const originalSecrets = Bun.secrets;

beforeEach(() => {
	const store = new Map<string, string>();
	const key = ({service, name}: {service: string; name: string}) => `${service}:${name}`;

	(Bun as unknown as {secrets: typeof Bun.secrets}).secrets = {
		get: async (opts: {service: string; name: string}) => store.get(key(opts)) ?? null,
		set: async (opts: {service: string; name: string; value?: string}, value?: string) => {
			const resolved = value ?? opts.value;
			if (resolved === undefined) {
				throw new Error('Bun.secrets.set requires a value');
			}
			store.set(key(opts), resolved);
		},
		delete: async (opts: {service: string; name: string}) => {
			store.delete(key(opts));
		},
	} as unknown as typeof Bun.secrets;
});

afterEach(() => {
	(Bun as unknown as {secrets: typeof Bun.secrets}).secrets = originalSecrets;
	rmSync(TEST_DIR, {recursive: true, force: true});
});

test('migrate skips existing vault unless force is set', async () => {
	const domain = 'com.example.skip';
	const domainFile = path.join(TEST_DIR, 'domains', 'skip.security.json5');
	const vaultDir = path.join(TEST_DIR, '.vault');
	mkdirSync(path.dirname(domainFile), {recursive: true});
	mkdirSync(vaultDir, {recursive: true});
	writeFileSync(path.join(vaultDir, `${domain}.inventory.json5`), '{}');

	await Bun.write(
		domainFile,
		json5Stringify({
			domain,
			secrets: {inventory: [{name: 'api-key', required: true}]},
		}),
	);

	const skipped = await migrate({cwd: TEST_DIR, silent: true});
	expect(skipped).toEqual({migrated: 0, skipped: 1});

	const forced = await migrate({cwd: TEST_DIR, silent: true, force: true});
	expect(forced).toEqual({migrated: 1, skipped: 0});
});

test('migrate splits inline inventory into encrypted store and metadata', async () => {
	const domain = 'com.example.test';
	const domainFile = path.join(TEST_DIR, 'domains', `${domain}.security.json5`);
	const vaultDir = path.join(TEST_DIR, '.vault');

	mkdirSync(path.dirname(domainFile), {recursive: true});
	mkdirSync(vaultDir, {recursive: true});

	await Bun.write(
		domainFile,
		json5Stringify({
			domain,
			colors: {
				primary: '#111111',
				secondary: '#222222',
				fatal: '#333333',
				warn: '#444444',
				info: '#555555',
				success: '#666666',
			},
			channels: {
				vault: '#777777',
				identity: '#888888',
				token: '#999999',
				csrf: '#AAAAAA',
				supplyChain: '#BBBBBB',
				ops: '#CCCCCC',
			},
			secrets: {
				inventory: [
					{name: 'api-key', required: true, description: 'API key'},
					{name: 'db-password', required: false},
				],
			},
		}),
	);

	const result = await migrate({cwd: TEST_DIR, silent: true});
	expect(result).toEqual({migrated: 1, skipped: 0});

	const privateInventory = Bun.file(path.join(vaultDir, `${domain}.inventory.json5`));
	expect(await privateInventory.exists()).toBe(true);
	const privateRaw = Bun.JSON5.parse(await privateInventory.text()) as {
		domain: string;
		masterKeyName: string;
		encryptedStore: string;
	};
	expect(privateRaw.domain).toBe(domain);
	expect(privateRaw.masterKeyName).toBe('vault-master-key');
	expect(privateRaw.encryptedStore).toBe(`${domain}.secrets.enc`);

	const storePath = path.join(vaultDir, `${domain}.secrets.enc`);
	expect(await Bun.file(storePath).exists()).toBe(true);

	const masterKey = await getMasterKey({service: domain, name: 'vault-master-key'});
	expect(masterKey).toBeString();

	const inventory = await loadEncryptedStore(storePath, masterKey as string);
	expect(inventory.map(entry => entry.name)).toEqual(['api-key', 'db-password']);

	const publicRaw = Bun.JSON5.parse(await Bun.file(domainFile).text()) as {
		secrets?: {inventory?: unknown};
	};
	expect(publicRaw.secrets?.inventory).toBeUndefined();

	const loaded = await loadDomainFile(domainFile);
	expect(loaded.config.secrets.inventory.map(entry => entry.name)).toEqual([
		'api-key',
		'db-password',
	]);

	const doctor = await checkAllDomains(TEST_DIR, {peerMeta: false});
	const domainReport = doctor.domains.find(entry => entry.domain === domain);
	expect(domainReport?.issues.filter(issue => issue.severity === 'error')).toHaveLength(0);
});

function json5Stringify(value: unknown): string {
	return JSON.stringify(value, null, '\t');
}
