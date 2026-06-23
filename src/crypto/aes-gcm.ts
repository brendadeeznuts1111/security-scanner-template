export interface EncryptedEnvelope {
	/** Base64-encoded random IV. */
	iv: string;
	/** Base64-encoded authentication tag. */
	authTag: string;
	/** Base64-encoded ciphertext. */
	data: string;
}

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

/**
 * Derive an AES-GCM key from a UTF-8 master key using SHA-256 as a simple KDF.
 */
export async function deriveKey(masterKey: string): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const hash = await crypto.subtle.digest('SHA-256', encoder.encode(masterKey));
	return crypto.subtle.importKey('raw', hash, {name: ALGORITHM, length: KEY_LENGTH}, false, [
		'encrypt',
		'decrypt',
	]);
}

/**
 * Encrypt a string with AES-GCM. Returns an envelope with base64 fields.
 */
export async function encryptText(
	plaintext: string,
	masterKey: string,
): Promise<EncryptedEnvelope> {
	const key = await deriveKey(masterKey);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encoder = new TextEncoder();
	const ciphertext = await crypto.subtle.encrypt(
		{name: ALGORITHM, iv},
		key,
		encoder.encode(plaintext),
	);

	const full = new Uint8Array(ciphertext);
	const authTag = full.slice(full.length - 16);
	const data = full.slice(0, full.length - 16);

	return {
		iv: Buffer.from(iv).toString('base64'),
		authTag: Buffer.from(authTag).toString('base64'),
		data: Buffer.from(data).toString('base64'),
	};
}

/**
 * Decrypt an AES-GCM envelope back to a UTF-8 string.
 */
export async function decryptText(envelope: EncryptedEnvelope, masterKey: string): Promise<string> {
	const key = await deriveKey(masterKey);
	const iv = Buffer.from(envelope.iv, 'base64');
	const authTag = Buffer.from(envelope.authTag, 'base64');
	const data = Buffer.from(envelope.data, 'base64');

	const ciphertext = new Uint8Array(data.length + authTag.length);
	ciphertext.set(data);
	ciphertext.set(authTag, data.length);

	const decrypted = await crypto.subtle.decrypt({name: ALGORITHM, iv}, key, ciphertext);
	const decoder = new TextDecoder();
	return decoder.decode(decrypted);
}
