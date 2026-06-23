import {encryptText, decryptText, type EncryptedEnvelope} from '../crypto/aes-gcm.ts';
import type {SecretEntry} from './types.ts';

export type {EncryptedEnvelope};

/**
 * Encrypt a secret inventory (JSON5 array) to a single envelope.
 *
 * @deprecated Prefer {@link encryptInventoryJSONL} for line-independent encryption.
 */
export async function encryptInventory(
	inventory: SecretEntry[],
	masterKey: string,
): Promise<EncryptedEnvelope> {
	const text = JSON.stringify(inventory, null, 2);
	return encryptText(text, masterKey);
}

/**
 * Decrypt a single-envelope secret inventory.
 *
 * @deprecated Prefer {@link decryptInventoryJSONL} for line-independent encryption.
 */
export async function decryptInventory(
	envelope: EncryptedEnvelope,
	masterKey: string,
): Promise<SecretEntry[]> {
	const text = await decryptText(envelope, masterKey);
	const parsed = Bun.JSON5.parse(text) as unknown;
	if (!Array.isArray(parsed)) {
		throw new Error('Decrypted inventory is not an array');
	}
	return parsed.filter((item): item is SecretEntry => typeof item.name === 'string');
}

/**
 * Encrypt a secret inventory into a JSONL string.
 * Each line is an independently encrypted secret entry, so a single corrupted
 * line does not affect the rest of the file and single-line rotation does not
 * require rewriting the entire vault.
 */
export async function encryptInventoryJSONL(
	inventory: SecretEntry[],
	masterKey: string,
): Promise<string> {
	const lines: string[] = [];
	for (const entry of inventory) {
		const envelope = await encryptText(JSON.stringify(entry), masterKey);
		lines.push(JSON.stringify(envelope));
	}
	return lines.join('\n') + (lines.length > 0 ? '\n' : '');
}

/**
 * Decrypt a JSONL-encoded secret inventory.
 * Each line is decrypted independently; parse errors on one line do not
 * prevent reading the remaining secrets.
 */
export async function decryptInventoryJSONL(
	text: string,
	masterKey: string,
): Promise<SecretEntry[]> {
	const lines = text.split('\n').filter(line => line.trim().length > 0);
	const entries: SecretEntry[] = [];

	for (const line of lines) {
		let envelope: EncryptedEnvelope;
		try {
			envelope = JSON.parse(line) as EncryptedEnvelope;
		} catch {
			continue;
		}

		try {
			const plaintext = await decryptText(envelope, masterKey);
			const parsed = JSON.parse(plaintext) as unknown;
			if (isSecretEntry(parsed)) {
				entries.push(parsed);
			}
		} catch {
			// Skip corrupted or unauthenticated lines.
		}
	}

	return entries;
}

function isSecretEntry(value: unknown): value is SecretEntry {
	return (
		typeof value === 'object' && value !== null && typeof (value as SecretEntry).name === 'string'
	);
}
