/**
 * Canonical ground-truth snapshots for drift detection (doctor / CI gates).
 */
import path from 'path';
import {fingerprintFromSections, canonicalSerialize} from '../domain/doctor-snapshot-canonical.ts';
import {
	auditGroundTruthCatalog,
	GROUND_TRUTH_CATALOG,
	GROUND_TRUTH_REQUIRED_XREF_IDS,
	type GroundTruthCatalogAudit,
} from './ground-truth-catalog.ts';
import {evaluateGroundTruthGoal, type GroundTruthGoalResult} from './ground-truth-goal.ts';

export const GROUND_TRUTH_SNAPSHOT_VERSION = 1 as const;

export interface GroundTruthSnapshotEntry {
	xrefId: string;
	refPaths: string[];
	localModules: string[];
}

export interface GroundTruthSnapshot {
	version: typeof GROUND_TRUTH_SNAPSHOT_VERSION;
	timestamp: string;
	entryCount: number;
	refCount: number;
	requiredXrefIds: string[];
	entries: GroundTruthSnapshotEntry[];
	fingerprint: string;
	goalOk: boolean;
}

export interface GroundTruthSnapshotDrift {
	ok: boolean;
	currentFingerprint: string;
	baselineFingerprint?: string;
	changedXrefIds: string[];
	addedXrefIds: string[];
	removedXrefIds: string[];
}

export interface GroundTruthSnapshotGateResult {
	ok: boolean;
	drift: GroundTruthSnapshotDrift;
	goal: GroundTruthGoalResult;
	snapshot: GroundTruthSnapshot;
	baselinePath?: string;
	missingBaseline?: boolean;
}

export function defaultGroundTruthSnapshotPath(root: string = process.cwd()): string {
	return path.join(root, '.security/snapshots/ground-truth.json');
}

export function buildGroundTruthSnapshotEntries(): GroundTruthSnapshotEntry[] {
	return GROUND_TRUTH_CATALOG.map(entry => ({
		xrefId: entry.xrefId,
		refPaths: entry.refs.map(ref => `${ref.repo}:${ref.path}`).sort(),
		localModules: [...entry.localModules].filter(module => module.startsWith('src/')).sort(),
	}));
}

export function fingerprintGroundTruthSnapshot(
	payload: Omit<GroundTruthSnapshot, 'fingerprint' | 'timestamp' | 'goalOk'>,
): string {
	return fingerprintFromSections([
		payload.version,
		payload.entryCount,
		payload.refCount,
		payload.requiredXrefIds,
		payload.entries,
	]);
}

export function buildGroundTruthSnapshot(
	audit: GroundTruthCatalogAudit,
	goal: GroundTruthGoalResult,
	timestamp: string = new Date().toISOString(),
): GroundTruthSnapshot {
	const entries = buildGroundTruthSnapshotEntries();
	const payload = {
		version: GROUND_TRUTH_SNAPSHOT_VERSION,
		entryCount: audit.entryCount,
		refCount: audit.refCount,
		requiredXrefIds: [...GROUND_TRUTH_REQUIRED_XREF_IDS],
		entries,
	};
	return {
		...payload,
		timestamp,
		fingerprint: fingerprintGroundTruthSnapshot(payload),
		goalOk: goal.ok,
	};
}

export async function collectGroundTruthSnapshot(root: string = process.cwd()): Promise<{
	audit: GroundTruthCatalogAudit;
	goal: GroundTruthGoalResult;
	snapshot: GroundTruthSnapshot;
}> {
	const audit = await auditGroundTruthCatalog(root);
	const goal = evaluateGroundTruthGoal(audit);
	const snapshot = buildGroundTruthSnapshot(audit, goal);
	return {audit, goal, snapshot};
}

export function compareGroundTruthSnapshots(
	current: GroundTruthSnapshot,
	baseline: GroundTruthSnapshot,
): GroundTruthSnapshotDrift {
	const currentIds = new Set(current.entries.map(entry => entry.xrefId));
	const baselineIds = new Set(baseline.entries.map(entry => entry.xrefId));

	const addedXrefIds = [...currentIds].filter(id => !baselineIds.has(id)).sort();
	const removedXrefIds = [...baselineIds].filter(id => !currentIds.has(id)).sort();

	const changedXrefIds: string[] = [];
	const baselineById = new Map(baseline.entries.map(entry => [entry.xrefId, entry]));
	for (const entry of current.entries) {
		const previous = baselineById.get(entry.xrefId);
		if (!previous) continue;
		const currentKey = canonicalSerialize(entry);
		const previousKey = canonicalSerialize(previous);
		if (currentKey !== previousKey) {
			changedXrefIds.push(entry.xrefId);
		}
	}

	return {
		ok:
			current.fingerprint === baseline.fingerprint &&
			addedXrefIds.length === 0 &&
			removedXrefIds.length === 0 &&
			changedXrefIds.length === 0,
		currentFingerprint: current.fingerprint,
		baselineFingerprint: baseline.fingerprint,
		changedXrefIds: changedXrefIds.sort(),
		addedXrefIds,
		removedXrefIds,
	};
}

export async function loadGroundTruthSnapshot(
	snapshotPath: string,
): Promise<GroundTruthSnapshot | undefined> {
	const file = Bun.file(snapshotPath);
	if (!(await file.exists())) {
		return undefined;
	}
	try {
		return (await file.json()) as GroundTruthSnapshot;
	} catch {
		return undefined;
	}
}

export async function writeGroundTruthSnapshot(
	snapshot: GroundTruthSnapshot,
	snapshotPath: string,
): Promise<void> {
	await Bun.write(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
}

export async function evaluateGroundTruthSnapshotGate(
	root: string = process.cwd(),
	options: {
		snapshotPath?: string;
		updateBaseline?: boolean;
		failOnGoal?: boolean;
	} = {},
): Promise<GroundTruthSnapshotGateResult> {
	const snapshotPath = options.snapshotPath ?? defaultGroundTruthSnapshotPath(root);
	const {goal, snapshot} = await collectGroundTruthSnapshot(root);
	const baseline = await loadGroundTruthSnapshot(snapshotPath);

	if (!baseline) {
		if (options.updateBaseline) {
			await writeGroundTruthSnapshot(snapshot, snapshotPath);
		}
		return {
			ok: goal.ok && !options.failOnGoal,
			drift: {
				ok: true,
				currentFingerprint: snapshot.fingerprint,
				changedXrefIds: [],
				addedXrefIds: [],
				removedXrefIds: [],
			},
			goal,
			snapshot,
			baselinePath: snapshotPath,
			missingBaseline: true,
		};
	}

	const drift = compareGroundTruthSnapshots(snapshot, baseline);
	if (options.updateBaseline) {
		await writeGroundTruthSnapshot(snapshot, snapshotPath);
	}

	const ok = drift.ok && goal.ok && (!options.failOnGoal || goal.ok);
	return {
		ok,
		drift,
		goal,
		snapshot,
		baselinePath: snapshotPath,
		missingBaseline: false,
	};
}
