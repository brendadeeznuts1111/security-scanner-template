import {rename} from 'fs/promises';

const domainLocks = new Map<string, Promise<void>>();

/** Per-domain write lock for parallel snapshot updates (spec §14.3). */
export async function withDomainWriteLock<T>(domainId: string, fn: () => Promise<T>): Promise<T> {
	const previous = domainLocks.get(domainId) ?? Promise.resolve();
	let release!: () => void;
	const gate = new Promise<void>(resolve => {
		release = resolve;
	});
	domainLocks.set(
		domainId,
		previous.then(() => gate),
	);

	await previous;
	try {
		return await fn();
	} finally {
		release();
		if (domainLocks.get(domainId) === gate) {
			domainLocks.delete(domainId);
		}
	}
}

/** Atomic snapshot write via temp file + rename (spec §14.2). */
export async function writeSnapshotAtomically(destPath: string, body: string): Promise<void> {
	const tmpPath = `${destPath}.tmp`;
	await Bun.write(tmpPath, body);
	await rename(tmpPath, destPath);
}
