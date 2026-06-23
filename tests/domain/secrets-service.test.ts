import {expect, test} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {
	detectPublicSecretsServiceMismatch,
	inventorySecretLookup,
	masterKeyLookup,
	resolveSecretsService,
	secretsServiceForDomain,
	syncSecretsService,
} from '../../src/domain/secrets-service.ts';

test('resolveSecretsService always returns the domain id', () => {
	const config = applyDefaults({
		domain: 'com.example.secrets',
		secrets: {service: 'com.other.service', inventory: []},
		csrf: {enabled: false, tokenLength: 32},
	});
	expect(resolveSecretsService(config)).toBe('com.example.secrets');
	expect(config.secrets.service).toBe('com.example.secrets');
});

test('secretsServiceForDomain mirrors bare domain strings', () => {
	expect(secretsServiceForDomain('com.acme.scanner')).toBe('com.acme.scanner');
});

test('detectPublicSecretsServiceMismatch flags overrides in public config', () => {
	const mismatch = detectPublicSecretsServiceMismatch('com.example.a', {
		domain: 'com.example.a',
		secrets: {service: 'com.other.b'},
	});
	expect(mismatch).toBe('com.other.b');

	const aligned = detectPublicSecretsServiceMismatch('com.example.a', {
		domain: 'com.example.a',
		secrets: {service: 'com.example.a'},
	});
	expect(aligned).toBeNull();
});

test('masterKeyLookup scopes to domain service namespace', () => {
	const config = applyDefaults({
		domain: 'com.example.vault',
		csrf: {enabled: false, tokenLength: 32},
	});
	expect(masterKeyLookup(config, 'vault-master-key')).toEqual({
		service: 'com.example.vault',
		name: 'vault-master-key',
	});
});

test('inventorySecretLookup resolves inventory entries by domain service', () => {
	const config = applyDefaults({
		domain: 'com.example.inventory',
		secrets: {
			inventory: [{name: 'api-key', required: true}],
		},
		csrf: {enabled: false, tokenLength: 32},
	});
	expect(inventorySecretLookup(config, 'api-key')).toEqual({
		service: 'com.example.inventory',
		name: 'api-key',
	});
	expect(inventorySecretLookup(config, 'missing')).toBeNull();
});

test('syncSecretsService re-aligns drifted secrets.service', () => {
	const config = applyDefaults({
		domain: 'com.example.sync',
		csrf: {enabled: false, tokenLength: 32},
	});
	config.secrets.service = 'com.wrong.service';
	syncSecretsService(config);
	expect(config.secrets.service).toBe('com.example.sync');
});

test('applyDefaults aligns feed apiKeyService with domain when vault name is set', () => {
	const config = applyDefaults({
		domain: 'com.example.feed',
		supplyChain: {
			enabled: true,
			feed: {apiKeyVault: 'threat-feed-api-key'},
		},
		csrf: {enabled: false, tokenLength: 32},
	});
	expect(config.supplyChain.feed.apiKeyService).toBe('com.example.feed');
});