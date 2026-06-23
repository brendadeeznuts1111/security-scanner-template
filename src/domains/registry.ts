/**
 * Domain secret registry.
 *
 * Every secret is addressed by exactly two strings:
 *   service: the reverse-DNS domain name
 *   name:    the secret purpose
 *
 * This registry enforces that mapping and records whether each secret is
 * required and whether it may be read by any same-user process
 * (allowUnrestrictedAccess).
 */

export interface DomainSecret {
	/** Reverse-DNS domain that owns this secret. */
	domain: string;
	/** Service key passed to Bun.secrets (identical to the domain). */
	service: string;
	/** Human-readable purpose for this secret. */
	name: string;
	/** Whether the secret is required for normal operation. */
	required: boolean;
	/** Whether same-user processes may read the credential without a prompt. */
	allowUnrestrictedAccess: boolean;
	/** Description of what the secret is used for. */
	description: string;
}

/**
 * Secrets for the Bun Security Scanner domain.
 */
export const SCANNER_DOMAIN = 'com.acme.bun-security-scanner';

export const DOMAIN_SECRETS: Record<string, DomainSecret[]> = {
	[SCANNER_DOMAIN]: [
		{
			domain: SCANNER_DOMAIN,
			service: SCANNER_DOMAIN,
			name: 'threat-feed-token',
			required: false,
			allowUnrestrictedAccess: false,
			description: 'Bearer token for authenticated remote threat feed requests',
		},
		{
			domain: SCANNER_DOMAIN,
			service: SCANNER_DOMAIN,
			name: 'registry-password',
			required: false,
			allowUnrestrictedAccess: false,
			description: 'Password for registry publish-time authentication checks',
		},
	],
};

/** List all registered domains. */
export function listDomains(): string[] {
	return Object.keys(DOMAIN_SECRETS).sort();
}

/** Get all secrets for a domain, or throw if the domain is unknown. */
export function getDomainSecrets(domain: string): DomainSecret[] {
	const secrets = DOMAIN_SECRETS[domain];
	if (!secrets) {
		throw new Error(`Unknown domain: ${domain}`);
	}
	return secrets;
}

/** Look up a single secret spec, or throw if it is unknown. */
export function getSecretSpec(domain: string, name: string): DomainSecret {
	const spec = getDomainSecrets(domain).find(s => s.name === name);
	if (!spec) {
		throw new Error(`Unknown secret "${name}" for domain ${domain}`);
	}
	return spec;
}
