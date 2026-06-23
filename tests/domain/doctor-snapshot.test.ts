import {expect, test} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {domainBrandingProfile} from '../../src/domain/branding.ts';
import {
	buildDoctorSnapshotDocument,
	buildDomainSnapshot,
	compareDoctorSnapshots,
	DOCTOR_SNAPSHOT_VERSION,
} from '../../src/domain/doctor-snapshot.ts';
import {getBunSnapshotRuntimeInfo} from '../../src/utils/snapshot-runtime.ts';

test('buildDomainSnapshot redacts secret matrix values', () => {
	const config = applyDefaults({
		domain: 'com.example.snapshot',
		secrets: {
			inventory: [{name: 'api-key', required: true}],
		},
		csrf: {enabled: false, tokenLength: 32},
	});
	const domain = {
		domain: config.domain,
		path: '/tmp/test.security.json5',
		ok: true,
		issues: [],
		branding: domainBrandingProfile(config),
		matrix: [
			{
				field: 'secrets.inventory',
				section: 'secrets' as const,
				flags: {
					template: true,
					domain: true,
					branding: false,
					service: false,
					secrets: true,
				},
				description: 'inventory',
				value: '[1]',
				source: 'config' as const,
			},
		],
		secretInventoryNames: ['api-key'],
	};
	const snapshot = buildDomainSnapshot(domain, true);
	expect(snapshot.secretInventoryNames).toEqual(['api-key']);
	expect(snapshot.matrix?.[0]?.value).toBe('[configured]');
});

test('compareDoctorSnapshots detects changed domains', () => {
	const runtime = getBunSnapshotRuntimeInfo();
	const base = buildDoctorSnapshotDocument(
		{
			ok: true,
			domains: [
				{
					domain: 'com.example.a',
					path: '/tmp/a.security.json5',
					ok: true,
					issues: [],
					branding: undefined,
				},
			],
			errors: 0,
			warnings: 0,
			crossDomainIssues: [],
			peerMetaIssues: [],
			runtime: {} as never,
			templateCoverage: {
				ok: true,
				missing: [],
				catalogFields: 1,
				path: '/tmp/template.json5',
				layerCounts: {
					field: 1,
					template: 1,
					domain: 1,
					branding: 0,
					service: 0,
					secrets: 0,
				},
			},
		},
		{packageMetadata: null, snapshotRuntime: runtime},
	);

	const changed = structuredClone(base);
	changed.domains[0]!.ok = false;
	const result = compareDoctorSnapshots(changed, base);
	expect(result.ok).toBe(false);
	expect(result.changed).toContain('com.example.a');
});

test('doctor snapshot document shape matches inline snapshot', () => {
	const runtime = getBunSnapshotRuntimeInfo();
	const document = buildDoctorSnapshotDocument(
		{
			ok: true,
			domains: [],
			errors: 0,
			warnings: 0,
			crossDomainIssues: [],
			peerMetaIssues: [],
			runtime: {} as never,
			templateCoverage: {
				ok: true,
				missing: [],
				catalogFields: 73,
				path: 'templates/domain.template.json5',
				layerCounts: {
					field: 73,
					template: 73,
					domain: 73,
					branding: 23,
					service: 36,
					secrets: 9,
				},
			},
		},
		{packageMetadata: null, snapshotRuntime: runtime},
	);

	expect(document.version).toBe(DOCTOR_SNAPSHOT_VERSION);
	expect(document.metadata.snapshotRuntime.nativeFlags).toEqual(['--update-snapshots', '-u']);

	// Stabilize volatile runtime fields for Bun's native snapshot matcher.
	document.metadata.capturedAt = '2020-01-01T00:00:00.000Z';
	document.metadata.bun = {version: '1.3.14', revision: 'test-revision'};
	expect(document).toMatchSnapshot();
});
