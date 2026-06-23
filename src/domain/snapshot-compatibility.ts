import type {PolicySnapshotConfig} from '../policy/types.ts';
import {SemverMatcher} from '../provider/semver-matcher.ts';
import {DOCTOR_SNAPSHOT_COMPAT_RANGE} from './snapshot-types.ts';

export interface SnapshotCompatibilityResult {
	ok: boolean;
	snapshotVersion?: string;
	scannerVersion?: string;
	message?: string;
	migrationHint?: string;
}

/** Validate snapshot schema semver and scanner compatibility (Layer 5). */
export function validateSnapshotCompatibility(
	snapshotVersion: string,
	scannerVersion: string,
	policy?: PolicySnapshotConfig,
	options: {storedScannerVersion?: string} = {},
): SnapshotCompatibilityResult {
	const snapshotRange = policy?.snapshotVersionRange ?? DOCTOR_SNAPSHOT_COMPAT_RANGE;
	if (!SemverMatcher.snapshotCompatible(snapshotVersion, snapshotRange)) {
		return {
			ok: false,
			snapshotVersion,
			scannerVersion,
			message: `Snapshot version ${snapshotVersion} is not compatible with required range ${snapshotRange}`,
			migrationHint: `Run bun sp doctor --snapshot -u to upgrade the baseline.`,
		};
	}

	const scannerRange = policy?.compatibleScannerVersions;
	if (scannerRange && !SemverMatcher.satisfies(scannerVersion, scannerRange)) {
		return {
			ok: false,
			snapshotVersion,
			scannerVersion,
			message: `Scanner ${scannerVersion} is not compatible with snapshot policy range ${scannerRange}`,
			migrationHint: `Snapshot ${snapshotVersion} requires scanner ${scannerRange}. Run bun sp doctor --snapshot -u after upgrading.`,
		};
	}

	if (
		scannerRange &&
		options.storedScannerVersion &&
		!SemverMatcher.satisfies(options.storedScannerVersion, scannerRange)
	) {
		return {
			ok: false,
			snapshotVersion,
			scannerVersion,
			message: `Baseline was captured by scanner ${options.storedScannerVersion}, outside policy range ${scannerRange}`,
			migrationHint: `Run bun sp doctor --snapshot -u with a compatible scanner (${scannerRange}).`,
		};
	}

	return {ok: true, snapshotVersion, scannerVersion};
}