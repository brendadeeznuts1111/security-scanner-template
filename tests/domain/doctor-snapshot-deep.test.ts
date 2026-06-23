import {expect, test} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {
	collectDoctorSnapshotEnrichment,
	computeDomainFingerprint,
	diffDoctorSnapshotDomains,
} from '../../src/domain/doctor-snapshot-deep.ts';
import {buildDomainSnapshot} from '../../src/domain/doctor-snapshot.ts';

test('collectDoctorSnapshotEnrichment captures vault policy and audit concerns', async () => {
	const config = applyDefaults({
		domain: 'com.example.deep',
		supplyChain: {
			enabled: true,
			feed: {remote: 'https://example.com/feed'},
			policy: {fatal: ['malware'], warn: ['adware']},
		},
		csrf: {enabled: true, tokenLength: 32},
		tls: {useSystemCA: true},
		secrets: {inventory: [{name: 'api-key', required: true}]},
	});

	const enrichment = await collectDoctorSnapshotEnrichment(
		'/proj',
		'com.example.deep',
		'/proj/domains/com.example.deep.security.json5',
		config,
		{privateExists: false, policyDocument: null},
	);

	expect(enrichment.filename.ok).toBe(true);
	expect(enrichment.policy.enabled).toBe(true);
	expect(enrichment.policy.feedSource).toBe('remote');
	expect(enrichment.concerns.csrfEnabled).toBe(true);
	expect(enrichment.concerns.auditKind).toBe('jsonl');
	expect(enrichment.vault.inventoryCount).toBe(1);
});

test('diffDoctorSnapshotDomains reports changed sections and issue delta', () => {
	const base = buildDomainSnapshot({
		domain: 'com.example.diff',
		path: '/tmp/com.example.diff.security.json5',
		ok: true,
		issues: [],
	});
	const changed = buildDomainSnapshot({
		domain: 'com.example.diff',
		path: '/tmp/com.example.diff.security.json5',
		ok: false,
		issues: [
			{
				domain: 'com.example.diff',
				path: '/tmp/com.example.diff.security.json5',
				field: 'colors.primary',
				message: 'bad',
				severity: 'error',
				code: 'INVALID_COLOR',
			},
		],
	});

	const diff = diffDoctorSnapshotDomains(changed, base);
	expect(diff.changed).toBe(true);
	expect(diff.sections).toContain('issues');
	expect(diff.issueDelta?.added).toBe(1);
	expect(diff.issueDelta?.codes).toContain('INVALID_COLOR');
});

test('computeDomainFingerprint is stable for identical domain snapshots', () => {
	const domain = buildDomainSnapshot({
		domain: 'com.example.fp',
		path: '/tmp/com.example.fp.security.json5',
		ok: true,
		issues: [],
	});
	expect(computeDomainFingerprint(domain)).toBe(computeDomainFingerprint(domain));
	expect(domain.fingerprint).toMatch(/^[a-f0-9]{64}$/);
});
