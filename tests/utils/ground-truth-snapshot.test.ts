import {mkdirSync, mkdtempSync} from 'fs';
import path from 'path';
import {tmpdir} from 'os';
import {expect, test} from 'bun:test';
import {canonicalSerialize} from '../../src/domain/doctor-snapshot-canonical.ts';
import {
	buildGroundTruthSnapshot,
	buildGroundTruthSnapshotEntries,
	collectGroundTruthSnapshot,
	compareGroundTruthSnapshots,
	defaultGroundTruthSnapshotPath,
	evaluateGroundTruthSnapshotGate,
	fingerprintGroundTruthSnapshot,
} from '../../src/utils/ground-truth-snapshot.ts';

const ROOT = path.join(import.meta.dir, '../..');

test('buildGroundTruthSnapshotEntries is deterministic', () => {
	const a = buildGroundTruthSnapshotEntries();
	const b = buildGroundTruthSnapshotEntries();
	expect(canonicalSerialize(a)).toBe(canonicalSerialize(b));
});

test('fingerprintGroundTruthSnapshot is stable for same payload', async () => {
	const {audit, goal} = await collectGroundTruthSnapshot(ROOT);
	const snap = buildGroundTruthSnapshot(audit, goal, '2026-01-01T00:00:00.000Z');
	const again = buildGroundTruthSnapshot(audit, goal, '2026-01-01T00:00:00.000Z');
	expect(snap.fingerprint).toBe(again.fingerprint);
	expect(snap.fingerprint).toMatch(/^[a-f0-9]{64}$/);
	expect(fingerprintGroundTruthSnapshot(snap)).toBe(snap.fingerprint);
});

test('compareGroundTruthSnapshots detects xref entry changes', async () => {
	const {snapshot} = await collectGroundTruthSnapshot(ROOT);
	const mutated = structuredClone(snapshot);
	mutated.entries[0]!.refPaths = ['bun:docs/changed.mdx'];
	const drift = compareGroundTruthSnapshots(mutated, snapshot);
	expect(drift.ok).toBe(false);
	expect(drift.changedXrefIds.length).toBeGreaterThan(0);
});

test('ground truth snapshot canonical payload matches fixture', async () => {
	const {snapshot} = await collectGroundTruthSnapshot(ROOT);
	const fixture = {
		version: snapshot.version,
		entryCount: snapshot.entryCount,
		refCount: snapshot.refCount,
		requiredXrefIds: snapshot.requiredXrefIds,
		entries: snapshot.entries,
		fingerprint: snapshot.fingerprint,
		goalOk: snapshot.goalOk,
	};
	expect(canonicalSerialize(fixture)).toMatchSnapshot();
});

test('evaluateGroundTruthSnapshotGate writes baseline on update', async () => {
	const snapshotDir = mkdtempSync(path.join(tmpdir(), 'gt-snapshot-'));
	mkdirSync(snapshotDir, {recursive: true});
	const snapshotPath = path.join(snapshotDir, 'ground-truth.json');
	const gate = await evaluateGroundTruthSnapshotGate(ROOT, {
		snapshotPath,
		updateBaseline: true,
	});
	expect(gate.snapshot.fingerprint.length).toBe(64);
	expect(gate.goal.ok).toBe(true);
	const loaded = await Bun.file(snapshotPath).json();
	expect(loaded.fingerprint).toBe(gate.snapshot.fingerprint);
});
