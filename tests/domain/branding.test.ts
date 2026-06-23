import {expect, test} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {
	domainBrandingProfile,
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

test('domainBrandingProfile aggregates display, service, qr, and runtime fields', () => {
	const config = applyDefaults({
		domain: 'com.example.profile',
		displayName: 'Profile',
		service: {interactive: true, http3: true, port: 8443},
		csrf: {enabled: false, tokenLength: 32},
	});
	const profile = domainBrandingProfile(config);
	expect(profile.displayName).toBe('Profile');
	expect(profile.service).toBe('com.example.profile');
	expect(profile.runtime.interactive).toBe(true);
	expect(profile.runtime.http3).toBe(true);
	expect(profile.runtime.port).toBe(8443);
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
