import {expect, test} from 'bun:test';
import {snapshotPolicyFromDocument} from '../../src/policy/engine.ts';
import {DOCTOR_SNAPSHOT_COMPAT_RANGE} from '../../src/domain/snapshot-types.ts';
import {validateSnapshotSemverVersion} from '../../src/domain/doctor-snapshot.ts';

test('validateSnapshotSemverVersion rejects incompatible snapshot semver', () => {
	const result = validateSnapshotSemverVersion(
		{
			schema: 'doctor-domain-snapshot',
			version: 2,
			snapshotVersion: '1.0.0',
			domain: 'com.example.legacy',
			domainEntry: {id: 'com.example.legacy'},
		},
		'^2.0.0',
	);
	expect(result.ok).toBe(false);
	expect(result.message).toContain('1.0.0');
});

test('snapshot policy defaults version range to caret 2.0.0', () => {
	const policy = snapshotPolicyFromDocument({
		snapshot: {allowedDrift: ['branding']},
	});
	expect(policy.snapshotVersionRange).toBe(DOCTOR_SNAPSHOT_COMPAT_RANGE);
});

test('snapshotPolicyFromDocument reads snapshotVersionRange from TOML policy', () => {
	const policy = snapshotPolicyFromDocument({
		snapshot: {snapshotVersionRange: '>=2.0.0 <3.0.0'},
	});
	expect(policy.snapshotVersionRange).toBe('>=2.0.0 <3.0.0');
});

test('snapshotPolicyFromDocument reads compatibleScannerVersions from policy', () => {
	const policy = snapshotPolicyFromDocument({
		snapshot: {compatibleScannerVersions: '>=1.0.0 <3.0.0'},
	});
	expect(policy.compatibleScannerVersions).toBe('>=1.0.0 <3.0.0');
});

test('validateSnapshotSemverVersion rejects incompatible running scanner', () => {
	const result = validateSnapshotSemverVersion(
		{
			schema: 'doctor-domain-snapshot',
			version: 2,
			snapshotVersion: '2.0.0',
			scannerVersion: '1.0.0',
			domain: 'com.example.app',
			fingerprint: 'a'.repeat(64),
			capturedAt: '2026-01-01T00:00:00.000Z',
			bun: {version: '1.3.14', revision: 'abc'},
			snapshotRuntime: {nativeFlags: [], matcherAvailable: true},
			domainEntry: {
				id: 'com.example.app',
				path: 'domains/com.example.app.json5',
				ok: true,
				issues: [],
				secretInventoryNames: [],
				layerCounts: {},
				filename: {expected: 'com.example.app.json5', actual: 'com.example.app.json5', ok: true},
				vault: {present: false, format: 'missing', inventoryCount: 0},
				policy: {enabled: true, fatal: [], warn: [], feedSource: 'none', tomlAligned: true},
				concerns: {csrfEnabled: false, auditKind: 'none'},
				templateDrift: [],
				fingerprint: 'a'.repeat(64),
			},
		},
		'^2.0.0',
		{
			scannerVersion: '3.0.0',
			snapshotPolicy: {compatibleScannerVersions: '>=1.0.0 <3.0.0'},
		},
	);
	expect(result.ok).toBe(false);
	expect(result.message).toContain('3.0.0');
});
