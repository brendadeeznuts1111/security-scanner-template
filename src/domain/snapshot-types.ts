import type {DoctorSnapshotDomain, DoctorSnapshotPerDomainFile} from './doctor-snapshot.ts';

/** Current semantic version of the doctor per-domain snapshot schema. */
export const DOCTOR_SNAPSHOT_SEMVER = '2.0.0';

/** Bun.semver range accepted when reading on-disk baselines. */
export const DOCTOR_SNAPSHOT_COMPAT_RANGE = '^2.0.0';

/** v2 per-domain snapshot file (spec: DoctorSnapshotV2). */
export type DoctorSnapshotV2 = DoctorSnapshotPerDomainFile & {
	snapshotVersion: string;
};

/** Domain payload embedded in a per-domain snapshot. */
export type DomainSnapshot = DoctorSnapshotDomain;
