import {expect, test, beforeEach, afterEach} from 'bun:test';
import {encryptInventory, decryptInventory} from '../../src/config/vault.ts';

const TEST_DIR = `/tmp/vault-test-${Date.now()}`;

beforeEach(async () => {
	await Bun.write(TEST_DIR, '').catch(() => {});
	const {rm, mkdir} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
	await mkdir(TEST_DIR, {recursive: true});
	await mkdir(`${TEST_DIR}/domains`, {recursive: true});
	await mkdir(`${TEST_DIR}/.vault`, {recursive: true});
});

afterEach(async () => {
	const {rm} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
});

test('encryptInventory and decryptInventory round-trip', async () => {
	const inventory = [
		{name: 'api-key', required: true, description: 'API key'},
		{name: 'db-pass', required: false, description: 'Database password'},
	];
	const envelope = await encryptInventory(inventory, 'test-master-key');
	const decrypted = await decryptInventory(envelope, 'test-master-key');

	expect(decrypted.length).toBe(2);
	expect(decrypted[0]?.name).toBe('api-key');
});

test('decryptInventory fails with wrong key', async () => {
	const inventory = [{name: 'api-key', required: true}];
	const envelope = await encryptInventory(inventory, 'test-master-key');

	await expect(decryptInventory(envelope, 'wrong-key')).rejects.toThrow();
});
