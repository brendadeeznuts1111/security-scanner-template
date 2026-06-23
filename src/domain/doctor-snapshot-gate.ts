import type {PolicySnapshotConfig} from '../policy/types.ts';
import type {DoctorSnapshotPerDomainResult} from './doctor-snapshot.ts';

/** Critical sections eligible for CI drift gates (v2 spec §4). */
export const SNAPSHOT_DRIFT_SECTIONS = [
	'vault',
	'policy',
	'concerns',
	'templateDrift',
	'bundles',
	'network',
] as const;

export type SnapshotDriftSection = (typeof SNAPSHOT_DRIFT_SECTIONS)[number];

export function isSnapshotDriftSection(value: string): value is SnapshotDriftSection {
	return (SNAPSHOT_DRIFT_SECTIONS as readonly string[]).includes(value);
}

export function parseSnapshotDriftSections(value: string | undefined): SnapshotDriftSection[] {
	if (!value?.trim()) {
		return [...SNAPSHOT_DRIFT_SECTIONS];
	}
	const parsed = value
		.split(',')
		.map(part => part.trim())
		.filter((part): part is SnapshotDriftSection => isSnapshotDriftSection(part));
	return parsed.length > 0 ? parsed : [...SNAPSHOT_DRIFT_SECTIONS];
}

export interface SnapshotDriftViolation {
	domain: string;
	path: string;
	missing: boolean;
	changedSections: SnapshotDriftSection[];
	/** Policy-required sections absent from the snapshot. */
	missingRequiredSections?: string[];
	fingerprint: string;
	previousFingerprint?: string;
}

export interface SnapshotDriftGateResult {
	ok: boolean;
	sections: SnapshotDriftSection[];
	violations: SnapshotDriftViolation[];
}

export interface SnapshotCompatibilityViolation {
	domain: string;
	path: string;
	message: string;
	snapshotVersion?: string;
	scannerVersion?: string;
	storedScannerVersion?: string;
}

export interface SnapshotCompatibilityGateResult {
	ok: boolean;
	violations: SnapshotCompatibilityViolation[];
}

/** Fail CI when baselines were captured with an incompatible scanner or schema. */
export function evaluateSnapshotCompatibilityGate(
	perDomain: readonly DoctorSnapshotPerDomainResult[],
): SnapshotCompatibilityGateResult {
	const violations: SnapshotCompatibilityViolation[] = [];
	for (const entry of perDomain) {
		if (!entry.snapshotVersionWarning) continue;
		violations.push({
			domain: entry.domain,
			path: entry.path,
			message: entry.snapshotVersionWarning,
			snapshotVersion: entry.snapshotVersion,
			scannerVersion: entry.scannerVersion,
			storedScannerVersion: entry.storedScannerVersion,
		});
	}
	return {ok: violations.length === 0, violations};
}

export function mergeSnapshotGateResults(
	drift: SnapshotDriftGateResult | undefined,
	compatibility: SnapshotCompatibilityGateResult | undefined,
): {ok: boolean; drift?: SnapshotDriftGateResult; compatibility?: SnapshotCompatibilityGateResult} {
	const driftOk = drift?.ok !== false;
	const compatOk = compatibility?.ok !== false;
	return {
		ok: driftOk && compatOk,
		drift,
		compatibility,
	};
}

/**
 * Evaluate per-domain snapshot diffs against a section filter for CI gates.
 * Missing baselines count as violations when `failOnMissing` is true (default).
 */
function filterAllowedDrift(
	changed: readonly string[],
	allowedDrift: readonly string[] | undefined,
): string[] {
	if (!allowedDrift || allowedDrift.length === 0) {
		return [...changed];
	}
	const allowed = new Set(allowedDrift);
	return changed.filter(section => !allowed.has(section));
}

export function evaluateSnapshotDriftGate(
	perDomain: readonly DoctorSnapshotPerDomainResult[],
	sections: readonly SnapshotDriftSection[],
	options: {failOnMissing?: boolean; policy?: PolicySnapshotConfig} = {},
): SnapshotDriftGateResult {
	const failOnMissing = options.failOnMissing !== false;
	const violations: SnapshotDriftViolation[] = [];

	for (const entry of perDomain) {
		const gatedChanges = filterAllowedDrift(entry.changedSections, options.policy?.allowedDrift);
		const matched = sections.filter(section =>
			gatedChanges.includes(section),
		) as SnapshotDriftSection[];
		const drifted = matched.length > 0;
		const missing = entry.missing && failOnMissing;
		const missingRequired = entry.missingRequiredSections ?? [];
		const requiredViolation = missingRequired.length > 0;

		if (drifted || missing || requiredViolation) {
			violations.push({
				domain: entry.domain,
				path: entry.path,
				missing: entry.missing,
				changedSections: missing ? [...sections] : matched,
				missingRequiredSections: requiredViolation ? missingRequired : undefined,
				fingerprint: entry.fingerprint,
				previousFingerprint: entry.previousFingerprint,
			});
		}
	}

	return {
		ok: violations.length === 0,
		sections: [...sections],
		violations,
	};
}
