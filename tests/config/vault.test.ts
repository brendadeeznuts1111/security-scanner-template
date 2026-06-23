import {expect, test, beforeEach, afterEach} from 'bun:test';
import {
	encryptInventory,
	decryptInventory,
	encryptInventoryJSONL,
	decryptInventoryJSONL,
} from '../../src/config/vault.ts';

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

test('encryptInventoryJSONL and decryptInventoryJSONL round-trip', async () => {
	const inventory = [
		{name: 'jwt-signing-key', required: true, description: 'JWT signing key'},
		{name: 'buckeye-api-key', required: true, description: 'Buckeye API key'},
		{name: 'db-password', required: false, description: 'Database password'},
	];
	const output = await encryptInventoryJSONL(inventory, 'test-master-key');

	expect(output.trim().split('\n').length).toBe(3);

	const decrypted = await decryptInventoryJSONL(output, 'test-master-key');
	expect(decrypted.length).toBe(3);
	expect(decrypted.map(e => e.name)).toEqual(['jwt-signing-key', 'buckeye-api-key', 'db-password']);
});

test('decryptInventoryJSONL skips corrupted lines', async () => {
	const inventory = [
		{name: 'first', required: true},
		{name: 'second', required: true},
	];
	const output = await encryptInventoryJSONL(inventory, 'test-master-key');
	const lines = output.trim().split('\n');
	// Corrupt the middle line.
	lines[1] = '{"iv":"aaaa","authTag":"bbbb","data":"cccc"}';
	const corrupted = lines.join('\n') + '\n';

	const decrypted = await decryptInventoryJSONL(corrupted, 'test-master-key');
	expect(decrypted.length).toBe(1);
	expect(decrypted[0]?.name).toBe('first');
});

test('decryptInventoryJSONL fails with wrong key', async () => {
	const inventory = [{name: 'api-key', required: true}];
	const output = await encryptInventoryJSONL(inventory, 'test-master-key');

	const decrypted = await decryptInventoryJSONL(output, 'wrong-key');
	expect(decrypted.length).toBe(0);
});
