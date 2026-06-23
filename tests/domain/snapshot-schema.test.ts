import {expect, test} from 'bun:test';
import {DoctorSnapshotV2Schema} from '../../src/domain/snapshot-schema.ts';
import {validateSnapshotSemverVersion} from '../../src/domain/doctor-snapshot.ts';
import {buildDomainSnapshot} from '../../src/domain/doctor-snapshot.ts';
import {DOCTOR_SNAPSHOT_SEMVER} from '../../src/domain/snapshot-types.ts';

test('DoctorSnapshotV2Schema accepts valid per-domain snapshot', () => {
	const domain = buildDomainSnapshot({
		domain: 'com.example.schema',
		path: '/tmp/com.example.schema.security.json5',
		ok: true,
		issues: [],
	});
	const payload = {
		schema: 'doctor-domain-snapshot' as const,
		version: 2 as const,
		snapshotVersion: DOCTOR_SNAPSHOT_SEMVER,
		capturedAt: '2020-01-01T00:00:00.000Z',
		domain: 'com.example.schema',
		fingerprint: domain.fingerprint,
		bun: {version: '1.3.14', revision: 'abc'},
		snapshotRuntime: {nativeFlags: ['--update-snapshots'], matcherAvailable: true},
		domainEntry: domain,
	};
	expect(DoctorSnapshotV2Schema.safeParse(payload).success).toBe(true);
});

test('validateSnapshotSemverVersion rejects incompatible snapshot semver', () => {
	const result = validateSnapshotSemverVersion({
		schema: 'doctor-domain-snapshot',
		version: 2,
		snapshotVersion: '3.0.0',
		domain: 'com.example.old',
		domainEntry: {},
	});
	expect(result.ok).toBe(false);
	expect(result.message).toContain('incompatible');
});