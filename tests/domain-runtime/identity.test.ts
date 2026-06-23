import {expect, test} from 'bun:test';
import {hashPassword, validatePassword, verifyPassword} from '../../src/domains/identity.ts';
import type {DomainIdentity} from '../../src/config/types.ts';

const policy: DomainIdentity = {
	algorithm: 'bcrypt',
	minLength: 8,
	requireSpecialChar: true,
};

test('validatePassword accepts strong password', () => {
	const result = validatePassword('Str0ng!pass', policy);
	expect(result.valid).toBe(true);
	expect(result.violations).toEqual([]);
});

test('validatePassword rejects short password', () => {
	const result = validatePassword('A!1', policy);
	expect(result.valid).toBe(false);
	expect(result.violations).toContain('too_short');
	expect(result.code).toBe('IDENTITY_WEAK_PASSWORD');
});

test('validatePassword rejects password without special character', () => {
	const result = validatePassword('LongPassword1', policy);
	expect(result.valid).toBe(false);
	expect(result.violations).toContain('missing_special_char');
});

test('hashPassword and verifyPassword round-trip with bcrypt', async () => {
	const password = 'MyS3cure!pass';
	const hash = await hashPassword(password, policy);
	expect(hash.startsWith('$2')).toBe(true);
	expect(await verifyPassword(password, hash, policy)).toBe(true);
	expect(await verifyPassword('wrong', hash, policy)).toBe(false);
});

test('hashPassword rejects policy violations', async () => {
	await expect(hashPassword('short', policy)).rejects.toThrow(/Password policy violation/);
});
