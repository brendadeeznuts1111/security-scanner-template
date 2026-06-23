import {expect, test} from 'bun:test';
import {
	DOMAIN_CONFIG_SUFFIX,
	expectedDomainConfigFilename,
	isValidSecretName,
	isValidTestDescription,
	isValidTestFilePath,
	SECRET_NAME_PATTERN,
	validateDomainConfigPath,
} from '../../src/domain/naming.ts';

test('expectedDomainConfigFilename uses reverse-DNS plus security suffix', () => {
	expect(expectedDomainConfigFilename('com.example.service')).toBe(
		`com.example.service${DOMAIN_CONFIG_SUFFIX}`,
	);
});

test('validateDomainConfigPath accepts matching basename', () => {
	const result = validateDomainConfigPath(
		'com.example.app',
		'/project/domains/com.example.app.security.json5',
	);
	expect(result.ok).toBe(true);
});

test('validateDomainConfigPath rejects short alias filenames', () => {
	const result = validateDomainConfigPath(
		'com.factory-wager.ledger',
		'/project/domains/ledger.security.json5',
	);
	expect(result.ok).toBe(false);
	expect(result.message).toContain('com.factory-wager.ledger.security.json5');
});

test('isValidSecretName accepts kebab-case inventory names', () => {
	expect(isValidSecretName('threat-feed-api-key')).toBe(true);
	expect(SECRET_NAME_PATTERN.test('api-key')).toBe(true);
});

test('isValidSecretName rejects uppercase and underscore names', () => {
	expect(isValidSecretName('API_KEY')).toBe(false);
	expect(isValidSecretName('bad_name')).toBe(false);
});

test('isValidTestDescription rejects should prefix and empty strings', () => {
	expect(isValidTestDescription('checkDomain passes for valid default config')).toBe(true);
	expect(isValidTestDescription('Should do something')).toBe(false);
	expect(isValidTestDescription('')).toBe(false);
});

test('isValidTestFilePath requires tests suffix', () => {
	expect(isValidTestFilePath('tests/config/doctor.test.ts')).toBe(true);
	expect(isValidTestFilePath('tests/config/doctor.ts')).toBe(false);
});
