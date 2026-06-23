import {expect, test} from 'bun:test';
import {
	BUN_UPDATE_SNAPSHOTS_ALIAS,
	BUN_UPDATE_SNAPSHOTS_FLAG,
	getBunSnapshotRuntimeInfo,
	isBunSnapshotMatcherAvailable,
	isUpdateSnapshotsRequested,
} from '../../src/utils/snapshot-runtime.ts';

test('isUpdateSnapshotsRequested detects Bun native snapshot flags', () => {
	expect(isUpdateSnapshotsRequested(['bun', 'doctor', BUN_UPDATE_SNAPSHOTS_FLAG])).toBe(true);
	expect(isUpdateSnapshotsRequested(['bun', 'doctor', BUN_UPDATE_SNAPSHOTS_ALIAS])).toBe(true);
	expect(isUpdateSnapshotsRequested(['bun', 'doctor'])).toBe(false);
});

test('getBunSnapshotRuntimeInfo exposes matcher availability', () => {
	const info = getBunSnapshotRuntimeInfo(['bun', 'test', BUN_UPDATE_SNAPSHOTS_FLAG]);
	expect(info.updateRequested).toBe(true);
	expect(info.nativeFlags).toEqual([BUN_UPDATE_SNAPSHOTS_FLAG, BUN_UPDATE_SNAPSHOTS_ALIAS]);
	expect(typeof info.matcherAvailable).toBe('boolean');
	expect(isBunSnapshotMatcherAvailable()).toBe(info.matcherAvailable);
});
