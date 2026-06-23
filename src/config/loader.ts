import path from 'path';
import {applyDefaults} from './defaults.ts';
import {decryptInventory, decryptInventoryJSONL} from './vault.ts';
import type {DomainConfig, LoadedDomain, SecretEntry} from './types.ts';

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export {type LoadedDomain} from './types.ts';

export const DOMAIN_GLOB = 'domains/*.security.json5';
export const TEMPLATE_PATH = new URL('../../templates/domain.template.json5', import.meta.url)
	.pathname;

/**
 * Discover all domain config files under the given root using Bun.Glob.
 */
export function discoverDomainFiles(root: string): string[] {
	const glob = new Bun.Glob(DOMAIN_GLOB);
	return Array.from(glob.scanSync({cwd: root, absolute: true}));
}

async function loadInventoryFile(
	config: DomainConfig,
	domainFilePath: string,
): Promise<SecretEntry[]> {
	const inventoryFile = config.secrets.inventoryFile;
	if (!inventoryFile) return config.secrets.inventory;

	const resolvedPath = path.resolve(path.dirname(domainFilePath), inventoryFile);
	const file = Bun.file(resolvedPath);
	if (!(await file.exists())) {
		throw new Error(`Inventory file not found: ${resolvedPath}`);
	}

	const text = await file.text();
	const masterKey = process.env.VAULT_MASTER_KEY;

	if (resolvedPath.endsWith('.enc')) {
		if (!masterKey) {
			throw new Error('VAULT_MASTER_KEY is required to decrypt inventory files');
		}
		// Try a single envelope first, then fall back to JSONL.
		const trimmed = text.trim();
		try {
			const envelope = Bun.JSON5.parse(trimmed) as unknown;
			if (
				isPlainObject(envelope) &&
				'data' in envelope &&
				'iv' in envelope &&
				'authTag' in envelope
			) {
				return decryptInventory(
					envelope as unknown as import('./vault.ts').EncryptedEnvelope,
					masterKey,
				);
			}
		} catch {
			/* not a single envelope */
		}
		return decryptInventoryJSONL(text, masterKey);
	}

	const parsed = Bun.JSON5.parse(text) as unknown;
	if (!Array.isArray(parsed)) {
		throw new Error(`Inventory file is not an array: ${resolvedPath}`);
	}
	return parsed.filter((item): item is SecretEntry => typeof item.name === 'string');
}

/**
 * Load a single domain config file and apply defaults.
 */
export async function loadDomainFile(filePath: string): Promise<LoadedDomain> {
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		throw new Error(`Domain file not found: ${filePath}`);
	}

	const text = await file.text();
	const parsed = Bun.JSON5.parse(text) as unknown;
	const config = applyDefaults(parsed);

	config.secrets.inventory = await loadInventoryFile(config, filePath);

	return {
		domain: config.domain,
		path: filePath,
		config,
	};
}

/**
 * Load all domain configs from a project root.
 */
export async function loadAllDomains(root: string): Promise<LoadedDomain[]> {
	const files = discoverDomainFiles(root);
	return Promise.all(files.map(loadDomainFile));
}

/**
 * Load the golden template as a raw DomainConfig (with placeholder domain).
 */
export async function loadTemplate(): Promise<DomainConfig> {
	const file = Bun.file(TEMPLATE_PATH);
	const text = await file.text();
	const parsed = Bun.JSON5.parse(text) as unknown;
	return applyDefaults(parsed);
}
