import path from 'path';
import {expect, test} from 'bun:test';
import {privateInventoryPath, resolveEncryptedStorePath} from '../../src/config/vault-paths.ts';

test('resolveEncryptedStorePath resolves relative to private vault directory', () => {
	const domainFile = '/project/domains/acme.security.json5';
	const privatePath = privateInventoryPath(domainFile, 'com.example.acme');
	expect(privatePath).toBe('/project/.vault/com.example.acme.inventory.json5');
	expect(resolveEncryptedStorePath(privatePath, 'com.example.acme.secrets.enc')).toBe(
		path.join('/project/.vault', 'com.example.acme.secrets.enc'),
	);
});
