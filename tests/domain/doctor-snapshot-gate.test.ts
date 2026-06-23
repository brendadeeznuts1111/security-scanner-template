import {expect, test} from 'bun:test';
import {
	evaluateSnapshotCompatibilityGate,
	evaluateSnapshotDriftGate,
} from '../../src/domain/doctor-snapshot-gate.ts';
import type {DoctorSnapshotPerDomainResult} from '../../src/domain/doctor-snapshot.ts';

function domainResult(
	overrides: Partial<DoctorSnapshotPerDomainResult> = {},
): DoctorSnapshotPerDomainResult {
	return {
		domain: 'com.example.app',
		path: '.security/snapshots/doctor/com.example.app.json',
		ok: true,
		missing: false,
		changed: false,
		fingerprint: 'a'.repeat(64),
		changedSections: [],
		...overrides,
	};
}

test('evaluateSnapshotCompatibilityGate fails when snapshot version warning is present', () => {
	const gate = evaluateSnapshotCompatibilityGate([
		domainResult({
			snapshotVersionWarning:
				'Scanner 3.0.0 is not compatible with snapshot policy range >=1.0.0 <3.0.0',
			scannerVersion: '3.0.0',
			snapshotVersion: '2.0.0',
		}),
	]);
	expect(gate.ok).toBe(false);
	expect(gate.violations).toHaveLength(1);
	expect(gate.violations[0]?.scannerVersion).toBe('3.0.0');
});

test('evaluateSnapshotCompatibilityGate passes when baselines are compatible', () => {
	const gate = evaluateSnapshotCompatibilityGate([domainResult()]);
	expect(gate.ok).toBe(true);
});

test('evaluateSnapshotDriftGate fails on network section drift', () => {
	const gate = evaluateSnapshotDriftGate(
		[domainResult({changed: true, changedSections: ['network']})],
		['network'],
	);
	expect(gate.ok).toBe(false);
	expect(gate.violations[0]?.changedSections).toContain('network');
});

test('evaluateSnapshotDriftGate and compatibility gate are independent', () => {
	const drift = evaluateSnapshotDriftGate(
		[domainResult({changed: true, changedSections: ['policy']})],
		['policy'],
	);
	const compatibility = evaluateSnapshotCompatibilityGate([
		domainResult({snapshotVersionWarning: 'incompatible'}),
	]);
	expect(drift.ok).toBe(false);
	expect(compatibility.ok).toBe(false);
});
