import {expect, test} from 'bun:test';
import {
	enrichDoctorIssue,
	getIssueCatalogEntry,
	operatorMirrorLogPath,
	operatorMasterLogPath,
} from '../../src/logging/issue-catalog.ts';

test('getIssueCatalogEntry resolves DOMAIN_FILENAME_MISMATCH with domain scope', () => {
	const entry = getIssueCatalogEntry('DOMAIN_FILENAME_MISMATCH');
	expect(entry?.scope).toBe('domain');
	expect(entry?.location).toBe('domains/*.security.json5');
	expect(entry?.defaultChannel).toBe('ops');
});

test('enrichDoctorIssue maps reverse-DNS domain to logSegment', () => {
	const enriched = enrichDoctorIssue({
		domain: 'com.example.app',
		path: '/proj/domains/com.example.app.security.json5',
		field: '_filename',
		message: 'ok',
		severity: 'error',
		code: 'DOMAIN_FILENAME_MISMATCH',
	});
	expect(enriched.scope).toBe('domain');
	expect(enriched.logSegment).toBe('com.example.app');
	expect(enriched.location).toBe('domains/*.security.json5');
});

test('enrichDoctorIssue routes install findings to core/install segment', () => {
	const enriched = enrichDoctorIssue({
		domain: 'install',
		path: '/proj',
		field: 'bun.lock',
		message: 'legacy lockfile',
		severity: 'warning',
		code: 'INSTALL_LEGACY_LOCKFILE',
	});
	expect(enriched.scope).toBe('core');
	expect(enriched.coreSegment).toBe('install');
	expect(enriched.logSegment).toBe('install');
});

test('operator log paths separate master and mirror targets', () => {
	expect(operatorMasterLogPath('/proj')).toBe('/proj/.security/operator.jsonl');
	expect(operatorMirrorLogPath('/proj', {scope: 'domain', logSegment: 'com.example.app'})).toBe(
		'/proj/.security/com.example.app/issues.jsonl',
	);
	expect(operatorMirrorLogPath('/proj', {scope: 'core', logSegment: 'lib'})).toBe(
		'/proj/.security/lib/issues.jsonl',
	);
});
