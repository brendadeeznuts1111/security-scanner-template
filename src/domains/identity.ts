import type {DomainIdentity} from '../config/types.ts';

export type PasswordViolation = 'too_short' | 'missing_special_char';

export interface PasswordValidationResult {
	valid: boolean;
	violations: PasswordViolation[];
	code?: 'IDENTITY_WEAK_PASSWORD';
}

const SPECIAL_CHAR_PATTERN = /[^A-Za-z0-9]/;

const SUPPORTED_PASSWORD_ALGORITHMS = ['bcrypt', 'argon2id', 'argon2i', 'argon2d'] as const;

export type PasswordAlgorithm = (typeof SUPPORTED_PASSWORD_ALGORITHMS)[number];

function resolveAlgorithm(policy: DomainIdentity): PasswordAlgorithm {
	if (SUPPORTED_PASSWORD_ALGORITHMS.includes(policy.algorithm as PasswordAlgorithm)) {
		return policy.algorithm as PasswordAlgorithm;
	}
	return 'argon2id';
}

/**
 * Validate a plaintext password against the domain identity policy.
 */
export function validatePassword(
	password: string,
	policy: DomainIdentity,
): PasswordValidationResult {
	const violations: PasswordViolation[] = [];

	if (password.length < policy.minLength) {
		violations.push('too_short');
	}

	if (policy.requireSpecialChar && !SPECIAL_CHAR_PATTERN.test(password)) {
		violations.push('missing_special_char');
	}

	if (violations.length === 0) {
		return {valid: true, violations};
	}

	return {
		valid: false,
		violations,
		code: 'IDENTITY_WEAK_PASSWORD',
	};
}

/**
 * Hash a password with Bun.password using the domain algorithm policy.
 * Throws if the password fails policy validation.
 */
export async function hashPassword(password: string, policy: DomainIdentity): Promise<string> {
	const validation = validatePassword(password, policy);
	if (!validation.valid) {
		throw new Error(`Password policy violation: ${validation.violations.join(', ')}`);
	}

	const algorithm = resolveAlgorithm(policy);
	if (algorithm === 'bcrypt') {
		const cost = policy.cost ?? 10;
		return Bun.password.hash(password, {algorithm: 'bcrypt', cost});
	}

	return Bun.password.hash(password, {algorithm});
}

/**
 * Verify a password against a previously hashed value.
 */
export async function verifyPassword(
	password: string,
	hash: string,
	policy: DomainIdentity,
): Promise<boolean> {
	const algorithm = resolveAlgorithm(policy);
	return Bun.password.verify(password, hash, algorithm);
}
