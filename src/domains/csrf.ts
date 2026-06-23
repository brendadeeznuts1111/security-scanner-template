import type {DomainCsrf} from '../config/types.ts';

export type CsrfErrorCode = 'CSRF_MISSING' | 'CSRF_MISMATCH' | 'CSRF_SESSION_MISSING';

export interface CsrfVerifyResult {
	valid: boolean;
	code?: CsrfErrorCode;
}

function isSessionBound(policy: DomainCsrf): boolean {
	return policy.mode === 'session-bound';
}

function generateOptions(policy: DomainCsrf, sessionId?: string): Bun.CSRFGenerateOptions {
	const options: Bun.CSRFGenerateOptions = {
		encoding: policy.encoding ?? 'base64url',
		algorithm: policy.algorithm ?? 'sha256',
	};

	if (policy.expiresIn !== undefined) {
		options.expiresIn = policy.expiresIn;
	}

	if (isSessionBound(policy) && sessionId) {
		(options as Bun.CSRFGenerateOptions & {sessionId?: string}).sessionId = sessionId;
	}

	return options;
}

function verifyOptions(
	secret: string,
	policy: DomainCsrf,
	sessionId?: string,
): Bun.CSRFVerifyOptions {
	const options: Bun.CSRFVerifyOptions = {
		secret,
		encoding: policy.encoding ?? 'base64url',
		algorithm: policy.algorithm ?? 'sha256',
	};

	const maxAge = policy.maxAge ?? policy.expiresIn;
	if (maxAge !== undefined) {
		options.maxAge = maxAge;
	}

	if (isSessionBound(policy) && sessionId) {
		(options as Bun.CSRFVerifyOptions & {sessionId?: string}).sessionId = sessionId;
	}

	return options;
}

/**
 * Generate a CSRF token signed with the domain secret via Bun.CSRF.
 * Session-bound mode requires a sessionId.
 */
export function generateToken(secret: string, policy: DomainCsrf, sessionId?: string): string {
	if (!policy.enabled) {
		return '';
	}

	if (isSessionBound(policy) && (!sessionId || sessionId.length === 0)) {
		throw new Error('sessionId is required for session-bound CSRF');
	}

	return Bun.CSRF.generate(secret, generateOptions(policy, sessionId));
}

/**
 * Verify a submitted CSRF token against the domain secret via Bun.CSRF.
 */
export function verifyToken(
	token: string | null | undefined,
	secret: string,
	policy: DomainCsrf,
	sessionId?: string,
): CsrfVerifyResult {
	if (!policy.enabled) {
		return {valid: true};
	}

	if (isSessionBound(policy) && (!sessionId || sessionId.length === 0)) {
		return {valid: false, code: 'CSRF_SESSION_MISSING'};
	}

	if (!token || token.length === 0) {
		return {valid: false, code: 'CSRF_MISSING'};
	}

	if (token.length < policy.tokenLength) {
		return {valid: false, code: 'CSRF_MISMATCH'};
	}

	const valid = Bun.CSRF.verify(token, verifyOptions(secret, policy, sessionId));
	return valid ? {valid: true} : {valid: false, code: 'CSRF_MISMATCH'};
}