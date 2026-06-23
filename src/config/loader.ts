import path from 'path';
import {filePathFromModuleUrl} from '../utils/runtime.ts';
import {applyDefaults} from './defaults.ts';
import {decryptInventory, decryptInventoryJSONL} from './vault.ts';
import {getMasterKey} from './master-key.ts';
import {masterKeyLookup} from '../domain/secrets-service.ts';
import {loadEncryptedStore} from './encrypted-store.ts';
import {createDomainSecurity, type DomainSecurity} from './security.ts';
import {privateInventoryPath, resolveEncryptedStorePath} from './vault-paths.ts';
import type {DomainConfig, LoadedDomain, SecretEntry} from './types.ts';

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export {type LoadedDomain} from './types.ts';

export const DOMAIN_GLOB = 'domains/*.security.json5';
export const TEMPLATE_PATH = filePathFromModuleUrl(
	new URL('../../templates/domain.template.json5', import.meta.url),
);

/**
 * Discover all domain config files under the given root using Bun.Glob.
 */
export function discoverDomainFiles(root: string): string[] {
	const glob = new Bun.Glob(DOMAIN_GLOB);
	return Array.from(glob.scanSync({cwd: root, absolute: true}));
}

interface PrivateInventoryMetadata {
	domain?: string;
	version?: number;
	createdAt?: string;
	masterKeyName?: string;
	encryptedStore?: string;
	secrets?: {
		inventory?: SecretEntry[];
	};
}

function parsePrivateInventory(raw: unknown): PrivateInventoryMetadata {
	if (!isPlainObject(raw)) return {};
	const secrets = isPlainObject(raw.secrets) ? raw.secrets : undefined;
	const inventory = Array.isArray(secrets?.inventory)
		? (secrets.inventory as SecretEntry[]).filter(
				(item): item is SecretEntry => typeof item.name === 'string',
			)
		: undefined;

	return {
		domain: typeof raw.domain === 'string' ? raw.domain : undefined,
		version: typeof raw.version === 'number' ? raw.version : undefined,
		createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
		masterKeyName: typeof raw.masterKeyName === 'string' ? raw.masterKeyName : undefined,
		encryptedStore: typeof raw.encryptedStore === 'string' ? raw.encryptedStore : undefined,
		secrets: inventory !== undefined ? {inventory} : undefined,
	};
}

async function loadPrivateInventory(
	config: DomainConfig,
	domainFilePath: string,
): Promise<SecretEntry[]> {
	const privatePath = privateInventoryPath(domainFilePath, config.domain);
	const file = Bun.file(privatePath);
	if (!(await file.exists())) {
		return config.secrets.inventory;
	}

	const raw = Bun.JSON5.parse(await file.text()) as unknown;
	const metadata = parsePrivateInventory(raw);

	// Phase B: encrypted store backed by a Bun.secrets master key.
	if (metadata.encryptedStore && metadata.masterKeyName) {
		const storePath = resolveEncryptedStorePath(privatePath, metadata.encryptedStore);
		const lookup = masterKeyLookup(config, metadata.masterKeyName);
		const masterKey = await getMasterKey(lookup);
		if (!masterKey) {
			throw new Error(`Master key not found in Bun.secrets for ${lookup.service}/${lookup.name}`);
		}
		return loadEncryptedStore(storePath, masterKey);
	}

	// Phase B fallback: unencrypted private inventory (deprecated after migration).
	if (metadata.secrets?.inventory) {
		return metadata.secrets.inventory;
	}

	return config.secrets.inventory;
}

async function loadInventoryFile(
	config: DomainConfig,
	domainFilePath: string,
): Promise<SecretEntry[]> {
	const inventoryFile = config.secrets.inventoryFile;
	if (!inventoryFile) {
		return loadPrivateInventory(config, domainFilePath);
	}

	const resolvedPath = path.resolve(path.dirname(domainFilePath), inventoryFile);
	const file = Bun.file(resolvedPath);
	if (!(await file.exists())) {
		throw new Error(`Inventory file not found: ${resolvedPath}`);
	}

	const text = await file.text();
	const masterKey = process.env.VAULT_MASTER_KEY;

	// Legacy encrypted inventory file (Phase A).
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
 * Load public domain config + defaults without resolving vault inventory.
 * Use for branding/concern matrix inspection when secrets are unavailable.
 */
export async function loadDomainConfigSurface(filePath: string): Promise<DomainConfig> {
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		throw new Error(`Domain file not found: ${filePath}`);
	}

	const text = await file.text();
	const parsed = Bun.JSON5.parse(text) as unknown;
	return applyDefaults(parsed);
}

/**
 * Find a domain by reverse-DNS id and load its public config surface (no vault decrypt).
 */
export async function loadDomainConfigById(root: string, domainId: string): Promise<DomainConfig> {
	for (const filePath of discoverDomainFiles(root)) {
		const config = await loadDomainConfigSurface(filePath);
		if (config.domain === domainId) {
			return config;
		}
	}
	throw new Error(`Unknown domain: ${domainId}`);
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
 * Load a single domain and construct its security context.
 */
export async function loadDomainSecurity(
	filePath: string,
	csrfSecret?: string,
): Promise<{loaded: LoadedDomain; security: DomainSecurity}> {
	const loaded = await loadDomainFile(filePath);
	const security = await createDomainSecurity(loaded.config, csrfSecret);
	return {loaded, security};
}

/**
 * Load one domain config by its `domain` field (does not load sibling domains).
 */
export async function loadSingleDomain(
	root: string,
	domainName: string,
): Promise<LoadedDomain> {
	for (const filePath of discoverDomainFiles(root)) {
		const file = Bun.file(filePath);
		const text = await file.text();
		const parsed = Bun.JSON5.parse(text) as {domain?: string};
		if (parsed.domain !== domainName) {
			continue;
		}
		return loadDomainFile(filePath);
	}
	throw new Error(`Domain not found: ${domainName}`);
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
