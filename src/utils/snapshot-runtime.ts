/**
 * Bun test runner snapshot integration (`bun test --update-snapshots` / `-u`).
 * @see https://bun.com/docs/test/snapshots
 */

export const BUN_UPDATE_SNAPSHOTS_FLAG = '--update-snapshots';
export const BUN_UPDATE_SNAPSHOTS_ALIAS = '-u';

export interface BunSnapshotRuntimeInfo {
	/** `expect(value).toMatchSnapshot()` is available (bun:test). */
	matcherAvailable: boolean;
	/** CLI requested snapshot refresh (`--update-snapshots` or `-u`). */
	updateRequested: boolean;
	nativeFlags: readonly [typeof BUN_UPDATE_SNAPSHOTS_FLAG, typeof BUN_UPDATE_SNAPSHOTS_ALIAS];
}

/**
 * Detect whether Bun's snapshot matchers are loaded (typically under bun:test).
 */
export function isBunSnapshotMatcherAvailable(): boolean {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const candidate = (globalThis as {expect?: (value: unknown) => {toMatchSnapshot?: () => void}})
			.expect;
		return typeof candidate === 'function' && typeof candidate({}).toMatchSnapshot === 'function';
	} catch {
		return false;
	}
}

/**
 * True when argv includes Bun's native snapshot update flags.
 */
export function isUpdateSnapshotsRequested(argv: readonly string[] = process.argv): boolean {
	return argv.includes(BUN_UPDATE_SNAPSHOTS_FLAG) || argv.includes(BUN_UPDATE_SNAPSHOTS_ALIAS);
}

export function getBunSnapshotRuntimeInfo(
	argv: readonly string[] = process.argv,
): BunSnapshotRuntimeInfo {
	return {
		matcherAvailable: isBunSnapshotMatcherAvailable(),
		updateRequested: isUpdateSnapshotsRequested(argv),
		nativeFlags: [BUN_UPDATE_SNAPSHOTS_FLAG, BUN_UPDATE_SNAPSHOTS_ALIAS],
	};
}
