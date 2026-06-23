export {
	hashPassword,
	verifyPassword,
	validatePassword,
	type PasswordAlgorithm,
	type PasswordValidationResult,
	type PasswordViolation,
} from '../domains/identity.ts';

import type {DomainIdentity} from '../config/types.ts';
import {hashPassword, verifyPassword, validatePassword} from '../domains/identity.ts';

/**
 * Per-domain password hasher bound to an identity policy.
 */
export class PasswordHasher {
	constructor(private readonly policy: DomainIdentity) {}

	validate(password: string) {
		return validatePassword(password, this.policy);
	}

	hash(password: string) {
		return hashPassword(password, this.policy);
	}

	verify(password: string, hash: string) {
		return verifyPassword(password, hash, this.policy);
	}
}
