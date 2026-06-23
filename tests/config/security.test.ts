import {expect, test} from 'bun:test';
import {createDomainSecurity} from '../../src/config/security.ts';
import {loadTemplate} from '../../src/config/loader.ts';

test('createDomainSecurity binds password, csrf, digest, and semver helpers', async () => {
	const config = await loadTemplate();
	const security = await createDomainSecurity(config, 'test-secret');

	expect(security.validatePassword('short').valid).toBe(false);
	expect(security.validatePassword('Str0ng!password').valid).toBe(true);

	const hash = await security.hashPassword('Str0ng!password');
	expect(await security.verifyPassword('Str0ng!password', hash)).toBe(true);
	expect(await security.verifyPassword('wrong', hash)).toBe(false);

	const sessionId = 'test-session';
	const token = security.generateCsrfToken(sessionId);
	expect(token.length).toBeGreaterThan(0);
	expect(security.verifyCsrfToken(token, sessionId).valid).toBe(true);
	expect(security.verifyCsrfToken('bad', sessionId).valid).toBe(false);

	const digest = await security.digestHex('hello');
	expect(digest).toMatch(/^[a-f0-9]{64}$/);
	expect(await security.verifyDigest('hello', digest)).toBe(true);
	expect(security.digestHexSync('hello')).toBe(digest);

	expect(security.satisfiesVersion('1.2.3', '>=1.0.0 <2.0.0')).toBe(true);
	expect(security.latestSatisfying(['1.0.0', '1.5.0', '2.0.0'], '^1.0.0')).toBe('1.5.0');
});
