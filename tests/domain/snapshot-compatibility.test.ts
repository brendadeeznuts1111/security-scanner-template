import {expect, test} from 'bun:test';
import {validateSnapshotCompatibility} from '../../src/domain/snapshot-compatibility.ts';

test('validateSnapshotCompatibility accepts scanner within policy range', () => {
	const result = validateSnapshotCompatibility('2.0.0', '1.0.0', {
		compatibleScannerVersions: '>=1.0.0 <3.0.0',
	});
	expect(result.ok).toBe(true);
});

test('validateSnapshotCompatibility rejects incompatible scanner', () => {
	const result = validateSnapshotCompatibility('2.0.0', '3.0.0', {
		compatibleScannerVersions: '>=1.0.0 <3.0.0',
	});
	expect(result.ok).toBe(false);
	expect(result.migrationHint).toContain('doctor --snapshot -u');
});

test('validateSnapshotCompatibility rejects baselines captured by incompatible scanner', () => {
	const result = validateSnapshotCompatibility('2.0.0', '2.1.0', {
		compatibleScannerVersions: '>=2.0.0 <3.0.0',
	}, {storedScannerVersion: '1.5.0'});
	expect(result.ok).toBe(false);
	expect(result.message).toContain('1.5.0');
});

test('validateSnapshotCompatibility accepts stored scanner within policy range', () => {
	const result = validateSnapshotCompatibility('2.0.0', '2.5.0', {
		compatibleScannerVersions: '>=2.0.0 <3.0.0',
	}, {storedScannerVersion: '2.1.0'});
	expect(result.ok).toBe(true);
});