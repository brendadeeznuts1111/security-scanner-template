import path from 'path';

/** Path to the private vault metadata file for a public domain config. */
export function privateInventoryPath(domainFilePath: string, domain: string): string {
	return path.resolve(path.dirname(domainFilePath), '..', '.vault', `${domain}.inventory.json5`);
}

/**
 * Resolve Phase B `encryptedStore` relative to the private inventory directory.
 * migrate-vault writes store filenames relative to `.vault/`, not `domains/`.
 */
export function resolveEncryptedStorePath(
	privateInventoryFilePath: string,
	encryptedStore: string,
): string {
	return path.resolve(path.dirname(privateInventoryFilePath), encryptedStore);
}
