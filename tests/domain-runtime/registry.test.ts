import {expect, test} from 'bun:test';
import {
	DOMAIN_SECRETS,
	getDomainSecrets,
	getSecretSpec,
	listDomains,
	SCANNER_DOMAIN,
} from '../../src/domains/registry.ts';

test('registry exposes the scanner domain', () => {
	expect(listDomains()).toContain(SCANNER_DOMAIN);
	expect(DOMAIN_SECRETS[SCANNER_DOMAIN]).toBeDefined();
});

test('getDomainSecrets returns secrets for the scanner domain', () => {
	const secrets = getDomainSecrets(SCANNER_DOMAIN);
	expect(secrets.length).toBeGreaterThan(0);
	expect(secrets.every(s => s.service === SCANNER_DOMAIN)).toBe(true);
});

test('getDomainSecrets throws for unknown domain', () => {
	expect(() => getDomainSecrets('com.example.unknown')).toThrow('Unknown domain');
});

test('getSecretSpec returns the correct spec', () => {
	const spec = getSecretSpec(SCANNER_DOMAIN, 'threat-feed-token');
	expect(spec.name).toBe('threat-feed-token');
	expect(spec.domain).toBe(SCANNER_DOMAIN);
	expect(spec.service).toBe(SCANNER_DOMAIN);
});

test('getSecretSpec throws for unknown secret', () => {
	expect(() => getSecretSpec(SCANNER_DOMAIN, 'unknown-secret')).toThrow('Unknown secret');
});
