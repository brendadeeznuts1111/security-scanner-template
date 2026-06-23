import {expect, test} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {
	detectPublicTokenIssuerMismatch,
	resolveTokenIssuer,
	syncTokenIssuer,
} from '../../src/domain/token-issuer.ts';

test('resolveTokenIssuer always returns the domain id', () => {
	const config = applyDefaults({
		domain: 'com.example.token',
		token: {issuer: 'com.other.issuer'},
		csrf: {enabled: false, tokenLength: 32},
	});
	expect(resolveTokenIssuer(config)).toBe('com.example.token');
	expect(config.token.issuer).toBe('com.example.token');
});

test('detectPublicTokenIssuerMismatch flags overrides in public config', () => {
	const mismatch = detectPublicTokenIssuerMismatch('com.example.a', {
		domain: 'com.example.a',
		token: {issuer: 'com.other.b'},
	});
	expect(mismatch).toBe('com.other.b');

	const aligned = detectPublicTokenIssuerMismatch('com.example.a', {
		domain: 'com.example.a',
		token: {issuer: 'com.example.a'},
	});
	expect(aligned).toBeNull();
});

test('syncTokenIssuer re-aligns drifted token.issuer', () => {
	const config = applyDefaults({
		domain: 'com.example.sync',
		csrf: {enabled: false, tokenLength: 32},
	});
	config.token.issuer = 'com.wrong.issuer';
	syncTokenIssuer(config);
	expect(config.token.issuer).toBe('com.example.sync');
});
