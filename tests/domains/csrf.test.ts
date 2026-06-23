import {expect, test} from 'bun:test';
import {generateToken, verifyToken} from '../../src/domains/csrf.ts';
import type {DomainCsrf} from '../../src/config/types.ts';

const policy: DomainCsrf = {
	enabled: true,
	tokenLength: 32,
};

const secret = 'test-csrf-secret';

test('generateToken and verifyToken round-trip', () => {
	const token = generateToken(secret, policy);
	expect(token.length).toBeGreaterThanOrEqual(policy.tokenLength);
	expect(verifyToken(token, secret, policy)).toEqual({valid: true});
});

test('verifyToken rejects missing token', () => {
	expect(verifyToken(undefined, secret, policy)).toEqual({
		valid: false,
		code: 'CSRF_MISSING',
	});
});

test('verifyToken rejects invalid token', () => {
	expect(verifyToken('not-a-real-token', secret, policy)).toEqual({
		valid: false,
		code: 'CSRF_MISMATCH',
	});
});

test('verifyToken rejects token signed with different secret', () => {
	const token = generateToken(secret, policy);
	expect(verifyToken(token, 'other-secret', policy)).toEqual({
		valid: false,
		code: 'CSRF_MISMATCH',
	});
});

test('generateToken returns empty string when disabled', () => {
	expect(generateToken(secret, {enabled: false, tokenLength: 32})).toBe('');
	expect(verifyToken(undefined, secret, {enabled: false, tokenLength: 32})).toEqual({valid: true});
});

test('session-bound generateToken requires sessionId', () => {
	const boundPolicy: DomainCsrf = {
		enabled: true,
		tokenLength: 32,
		mode: 'session-bound',
	};

	expect(() => generateToken(secret, boundPolicy)).toThrow('sessionId is required');
});

test('session-bound tokens are verified only for the matching session', () => {
	const boundPolicy: DomainCsrf = {
		enabled: true,
		tokenLength: 32,
		mode: 'session-bound',
		encoding: 'hex',
		algorithm: 'sha256',
	};

	const token = generateToken(secret, boundPolicy, 'session-a');
	expect(verifyToken(token, secret, boundPolicy, 'session-a')).toEqual({valid: true});
	expect(verifyToken(token, secret, boundPolicy, 'session-b')).toEqual({
		valid: false,
		code: 'CSRF_MISMATCH',
	});
});

test('verifyToken rejects session-bound request without sessionId', () => {
	const boundPolicy: DomainCsrf = {
		enabled: true,
		tokenLength: 32,
		mode: 'session-bound',
	};

	expect(verifyToken('token', secret, boundPolicy)).toEqual({
		valid: false,
		code: 'CSRF_SESSION_MISSING',
	});
});
