import type {DomainConfig} from '../config/types.ts';

/**
 * Canonical JWT issuer for a loaded domain config — always the reverse-DNS domain id.
 */
export function resolveTokenIssuer(config: DomainConfig): string {
	return config.domain;
}

/**
 * Keep `token.issuer` aligned with the domain id after defaults merge.
 */
export function syncTokenIssuer(config: DomainConfig): void {
	config.token.issuer = resolveTokenIssuer(config);
}

/**
 * Detect a `token.issuer` override in an unparsed public domain file.
 */
export function detectPublicTokenIssuerMismatch(
	domain: string,
	publicRaw: Record<string, unknown>,
): string | null {
	const token = publicRaw.token;
	if (typeof token !== 'object' || token === null || Array.isArray(token)) {
		return null;
	}
	const issuer = (token as Record<string, unknown>).issuer;
	if (typeof issuer !== 'string' || issuer.length === 0) {
		return null;
	}
	return issuer !== domain ? issuer : null;
}
