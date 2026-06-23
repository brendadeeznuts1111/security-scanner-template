import {expect, test} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {
	domainDisplayName,
	domainPromptLabel,
	domainServiceName,
	domainColorSwatches,
	domainQrColors,
} from '../../src/domain/branding.ts';

test('domainDisplayName prefers displayName over reverse-DNS domain', () => {
	const config = applyDefaults({
		domain: 'com.example.service',
		displayName: 'Example Service',
		csrf: {enabled: false, tokenLength: 32},
	});
	expect(domainDisplayName(config)).toBe('Example Service');
	expect(domainServiceName(config)).toBe('com.example.service');
	expect(domainPromptLabel(config)).toBe('sp:Example Service> ');
});

test('domainQrColors prefers token channel for modules and white background', () => {
	const config = applyDefaults({
		domain: 'com.example.qr-colors',
		channels: {token: '#AABBCC'},
		colors: {primary: '#112233'},
		csrf: {enabled: false, tokenLength: 32},
	});
	expect(domainQrColors(config)).toEqual({dark: '#AABBCC', light: '#FFFFFF'});
});

test('domainColorSwatches normalizes palette entries', () => {
	const config = applyDefaults({
		domain: 'com.example.colors',
		csrf: {enabled: false, tokenLength: 32},
	});
	const names = domainColorSwatches(config).map(s => s.name);
	expect(names.length).toBeGreaterThan(0);
	expect(names).toContain('primary');
});