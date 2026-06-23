/**
 * Per-domain master key management.
 *
 * Master keys are generated as 32-byte random values and stored only in the
 * OS credential manager via Bun.secrets. They never touch the filesystem or
 * environment variables.
 */

/** Default Bun.secrets name for domain vault master keys. */
export const DEFAULT_MASTER_KEY_NAME = 'vault-master-key';

export interface MasterKeyOptions {
	service: string;
	name: string;
}

/**
 * Generate a new 32-byte master key encoded as base64.
 */
export function generateMasterKey(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return Buffer.from(bytes).toString('base64');
}

/**
 * Check whether Bun.secrets is available and the requested key exists.
 */
export async function hasMasterKey(options: MasterKeyOptions): Promise<boolean> {
	const value = await getMasterKey(options);
	return value !== null;
}

/**
 * Read a master key from Bun.secrets.
 *
 * Returns null if the keychain is unavailable or the key is not present.
 * Never throws.
 */
export async function getMasterKey(options: MasterKeyOptions): Promise<string | null> {
	if (typeof Bun.secrets?.get !== 'function') {
		return null;
	}

	try {
		return await Bun.secrets.get(options);
	} catch {
		return null;
	}
}

/**
 * Store a master key in Bun.secrets.
 *
 * Throws if the keychain is unavailable or the write fails.
 */
export async function setMasterKey(options: MasterKeyOptions & {value: string}): Promise<void> {
	if (typeof Bun.secrets?.set !== 'function') {
		throw new Error('Bun.secrets.set is unavailable on this platform');
	}

	await Bun.secrets.set({...options, value: options.value});
}

/**
 * Delete a master key from Bun.secrets.
 */
export async function deleteMasterKey(options: MasterKeyOptions): Promise<void> {
	if (typeof Bun.secrets?.delete !== 'function') {
		throw new Error('Bun.secrets.delete is unavailable on this platform');
	}

	await Bun.secrets.delete(options);
}
