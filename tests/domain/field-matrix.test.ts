import {expect, test} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {TEMPLATE_PATH} from '../../src/config/loader.ts';
import {domainBrandingProfile} from '../../src/domain/branding.ts';
import {
	DOMAIN_FIELD_MATRIX,
	domainFieldValueRows,
	formatBrandingShowcase,
	formatFieldMatrixTable,
	validateTemplateFieldCoverage,
} from '../../src/domain/field-matrix.ts';

test('DOMAIN_FIELD_MATRIX covers core domain, branding, service, and secrets fields', () => {
	const fields = new Set(DOMAIN_FIELD_MATRIX.map(row => row.field));
	expect(fields.has('domain')).toBe(true);
	expect(fields.has('displayName')).toBe(true);
	expect(fields.has('colors.primary')).toBe(true);
	expect(fields.has('channels.token')).toBe(true);
	expect(fields.has('secrets.service')).toBe(true);
	expect(fields.has('service.interactive')).toBe(true);
	expect(fields.has('service.http3')).toBe(true);
	expect(fields.has('visual.qr.enabled')).toBe(true);
	expect(fields.has('tls.useSystemCA')).toBe(true);
	expect(DOMAIN_FIELD_MATRIX.length).toBeGreaterThanOrEqual(60);
});

test('golden template documents every catalog field', async () => {
	const text = await Bun.file(TEMPLATE_PATH).text();
	const result = await validateTemplateFieldCoverage(text);
	expect(result.missing).toEqual([]);
	expect(result.ok).toBe(true);
});

test('domainFieldValueRows resolves secrets.service from domain id', () => {
	const config = applyDefaults({
		domain: 'com.example.matrix',
		csrf: {enabled: false, tokenLength: 32},
	});
	const row = domainFieldValueRows(config).find(entry => entry.field === 'secrets.service');
	expect(row?.value).toBe('com.example.matrix');
	expect(row?.source).toBe('derived');
});

test('domainBrandingProfile includes colors, qr, report, and runtime', () => {
	const config = applyDefaults({
		domain: 'com.example.branding',
		displayName: 'Branding Test',
		channels: {token: '#AABBCC'},
		csrf: {enabled: false, tokenLength: 32},
	});
	const profile = domainBrandingProfile(config);
	expect(profile.displayName).toBe('Branding Test');
	expect(profile.service).toBe('com.example.branding');
	expect(profile.qr.dark).toBe('#AABBCC');
	expect(profile.report.format).toBe('markdown');
	expect(formatBrandingShowcase(profile).some(line => line.includes('Branding Test'))).toBe(true);
});

test('formatFieldMatrixTable renders layer flags', () => {
	const table = formatFieldMatrixTable(DOMAIN_FIELD_MATRIX.slice(0, 2));
	expect(table).toContain('field');
	expect(table).toContain('template');
	expect(table).toContain('branding');
	expect(table).toContain('domain');
});
