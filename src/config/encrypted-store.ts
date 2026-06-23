import {
	encryptInventoryJSONL,
	decryptInventoryJSONL,
	encryptInventory,
	decryptInventory,
	type EncryptedEnvelope,
} from './vault.ts';
import type {SecretEntry} from './types.ts';

/**
 * Save a secret inventory to disk using AES-GCM line-level encryption.
 * The file is written as JSONL: one encrypted envelope per line.
 */
export async function saveEncryptedStore(
	path: string,
	inventory: SecretEntry[],
	masterKey: string,
): Promise<void> {
	const text = await encryptInventoryJSONL(inventory, masterKey);
	await Bun.write(path, text);
}

/**
 * Load a secret inventory from an encrypted JSONL store.
 */
export async function loadEncryptedStore(path: string, masterKey: string): Promise<SecretEntry[]> {
	const file = Bun.file(path);
	if (!(await file.exists())) {
		throw new Error(`Encrypted store not found: ${path}`);
	}

	const text = await file.text();
	return decryptInventoryJSONL(text, masterKey);
}

/**
 * Check whether an encrypted store file exists on disk.
 */
export async function hasEncryptedStore(path: string): Promise<boolean> {
	return Bun.file(path).exists();
}

/**
 * Legacy single-envelope loader. Kept for backwards compatibility with older
 * `.enc` files that are not JSONL-encoded.
 */
export async function loadEncryptedStoreEnvelope(
	envelope: EncryptedEnvelope,
	masterKey: string,
): Promise<SecretEntry[]> {
	return decryptInventory(envelope, masterKey);
}

export {type EncryptedEnvelope};
