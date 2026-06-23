import {SessionBoundCSRF} from '../csrf/session-bound.ts';
import {createVaultDomain} from '../domains/vault.ts';
import {
	hashPassword,
	verifyPassword,
	validatePassword,
	type PasswordValidationResult,
} from '../domains/identity.ts';
import {generateToken, verifyToken, type CsrfVerifyResult} from '../domains/csrf.ts';
import {
	digestHex,
	digestHexSync,
	verifyDigest,
	satisfiesVersion,
	type DigestAlgorithm,
} from '../crypto/integrity.ts';
import {VersionMatcher, type VersionRange} from '../semver/index.ts';
import type {DomainConfig} from './types.ts';

export interface DomainSecurity {
	config: DomainConfig;
	csrfSecret: string;

	validatePassword(password: string): PasswordValidationResult;
	hashPassword(password: string): Promise<string>;
	verifyPassword(password: string, hash: string): Promise<boolean>;

	generateCsrfToken(sessionId?: string): string;
	verifyCsrfToken(
		token: string | null | undefined,
		sessionId?: string,
	): CsrfVerifyResult | ReturnType<SessionBoundCSRF['verify']>;
	sessionCsrf(): SessionBoundCSRF | null;

	digestHex(
		input: Blob | ArrayBuffer | Uint8Array | string,
		algorithm?: DigestAlgorithm,
	): Promise<string>;
	digestHexSync(input: ArrayBuffer | Uint8Array | string, algorithm?: DigestAlgorithm): string;
	verifyDigest(
		input: Blob | ArrayBuffer | Uint8Array | string,
		expectedHex: string,
		algorithm?: DigestAlgorithm,
	): Promise<boolean>;

	satisfiesVersion(version: string, range: string): boolean;
	latestSatisfying(versions: string[], range: string): string | null;
	isCompatible(version: string, constraints: VersionRange): boolean;
}

class DomainSecurityImpl implements DomainSecurity {
	private readonly sessionCsrfGuard: SessionBoundCSRF | null;

	constructor(
		readonly config: DomainConfig,
		readonly csrfSecret: string,
	) {
		this.sessionCsrfGuard =
			config.csrf.enabled && config.csrf.mode === 'session-bound' && csrfSecret.length > 0
				? SessionBoundCSRF.fromPolicy(csrfSecret, config.csrf)
				: null;
	}

	validatePassword(password: string): PasswordValidationResult {
		return validatePassword(password, this.config.identity);
	}

	hashPassword(password: string): Promise<string> {
		return hashPassword(password, this.config.identity);
	}

	verifyPassword(password: string, hash: string): Promise<boolean> {
		return verifyPassword(password, hash, this.config.identity);
	}

	sessionCsrf(): SessionBoundCSRF | null {
		return this.sessionCsrfGuard;
	}

	generateCsrfToken(sessionId?: string): string {
		return generateToken(this.csrfSecret, this.config.csrf, sessionId);
	}

	verifyCsrfToken(token: string | null | undefined, sessionId?: string) {
		return verifyToken(token, this.csrfSecret, this.config.csrf, sessionId);
	}

	digestHex(
		input: Blob | ArrayBuffer | Uint8Array | string,
		algorithm?: DigestAlgorithm,
	): Promise<string> {
		return digestHex(input, algorithm);
	}

	digestHexSync(input: ArrayBuffer | Uint8Array | string, algorithm?: DigestAlgorithm): string {
		return digestHexSync(input, algorithm);
	}

	verifyDigest(
		input: Blob | ArrayBuffer | Uint8Array | string,
		expectedHex: string,
		algorithm?: DigestAlgorithm,
	): Promise<boolean> {
		return verifyDigest(input, expectedHex, algorithm);
	}

	satisfiesVersion(version: string, range: string): boolean {
		return satisfiesVersion(version, range);
	}

	latestSatisfying(versions: string[], range: string): string | null {
		return VersionMatcher.latestSatisfying(versions, range);
	}

	isCompatible(version: string, constraints: VersionRange): boolean {
		return VersionMatcher.isCompatible(version, constraints);
	}
}

async function loadCsrfSecret(domain: string): Promise<string> {
	try {
		return await createVaultDomain(domain).get('csrf-secret');
	} catch {
		return '';
	}
}

export async function createDomainSecurity(
	config: DomainConfig,
	csrfSecret?: string,
): Promise<DomainSecurity> {
	const secret = csrfSecret ?? (await loadCsrfSecret(config.domain));
	return new DomainSecurityImpl(config, secret);
}
