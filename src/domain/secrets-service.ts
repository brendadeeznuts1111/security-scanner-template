import type {DomainConfig} from '../config/types.ts';
import type {MasterKeyOptions} from '../config/master-key.ts';

/**
 * Canonical Bun.secrets service key for a loaded domain config.
 * Always the reverse-DNS domain id — never a separate alias.
 */
export function resolveSecretsService(config: DomainConfig): string {
	return config.domain;
}

/**
 * Bun.secrets service key when only the domain id is known (CLI, registry vault).
 */
export function secretsServiceForDomain(domain: string): string {
	return domain;
}

/**
 * Keep `secrets.service` aligned with the domain id after defaults merge.
 */
export function syncSecretsService(config: DomainConfig): void {
	config.secrets.service = resolveSecretsService(config);
}

/**
 * Detect a `secrets.service` override in an unparsed public domain file.
 * Returns the mismatched service string, or null when absent or aligned.
 */
export function detectPublicSecretsServiceMismatch(
	domain: string,
	publicRaw: Record<string, unknown>,
): string | null {
	const secrets = publicRaw.secrets;
	if (typeof secrets !== 'object' || secrets === null || Array.isArray(secrets)) {
		return null;
	}
	const service = (secrets as Record<string, unknown>).service;
	if (typeof service !== 'string' || service.length === 0) {
		return null;
	}
	return service !== domain ? service : null;
}

/**
 * Master-key lookup scoped to the domain's Bun.secrets namespace.
 */
export function masterKeyLookup(config: DomainConfig, name: string): MasterKeyOptions {
	return {service: resolveSecretsService(config), name};
}

export interface SecretLookup {
	service: string;
	name: string;
}

/**
 * Resolve a named secret in the domain inventory for Bun.secrets I/O.
 */
export function inventorySecretLookup(
	config: DomainConfig,
	secretName: string,
): SecretLookup | null {
	const entry = config.secrets.inventory.find(item => item.name === secretName);
	if (!entry) return null;
	return {service: resolveSecretsService(config), name: entry.name};
}
