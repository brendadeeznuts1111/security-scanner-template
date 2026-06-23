import type {DomainConfig} from '../config/types.ts';
import {computeBundleSnapshot, type BundleSnapshot} from './doctor-snapshot-bundles.ts';

export interface BundleSnapshotJob {
	domain: string;
	config: DomainConfig;
}

export interface ParallelBundleSnapshotOptions {
	/** Fan out across Workers when job count meets threshold (default: 4). */
	enabled?: boolean;
	workerCount?: number;
	threshold?: number;
}

const DEFAULT_THRESHOLD = 4;
const DEFAULT_WORKER_COUNT = 4;
const WORKER_TIMEOUT_MS = 120_000;

function runBundleSnapshotWorker(
	root: string,
	job: BundleSnapshotJob,
): Promise<BundleSnapshotWorkerResult> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL('./bundle-snapshot-worker.ts', import.meta.url));
		const timeout = setTimeout(() => {
			worker.terminate();
			reject(new Error(`Bundle snapshot worker timed out for ${job.domain}`));
		}, WORKER_TIMEOUT_MS);

		worker.onmessage = (event: MessageEvent<BundleSnapshotWorkerResult>) => {
			clearTimeout(timeout);
			worker.terminate();
			resolve(event.data);
		};

		worker.onerror = error => {
			clearTimeout(timeout);
			worker.terminate();
			reject(error);
		};

		worker.postMessage({root, domain: job.domain, config: job.config});
	});
}

interface BundleSnapshotWorkerResult {
	domain: string;
	bundleSnapshot: BundleSnapshot | null;
}

/**
 * Compute per-domain bundle snapshots, fanning out across Workers for large domain sets.
 */
export async function computeBundleSnapshotsParallel(
	root: string,
	jobs: readonly BundleSnapshotJob[],
	options: ParallelBundleSnapshotOptions = {},
): Promise<Map<string, BundleSnapshot | null>> {
	const results = new Map<string, BundleSnapshot | null>();
	if (jobs.length === 0) {
		return results;
	}

	const threshold = options.threshold ?? DEFAULT_THRESHOLD;
	const enabled = options.enabled ?? jobs.length >= threshold;

	if (!enabled) {
		for (const job of jobs) {
			results.set(job.domain, await computeBundleSnapshot(root, job.config));
		}
		return results;
	}

	const workerCount = Math.max(1, options.workerCount ?? DEFAULT_WORKER_COUNT);
	const chunkSize = Math.max(1, Math.ceil(jobs.length / workerCount));
	const chunks: BundleSnapshotJob[][] = [];
	for (let index = 0; index < jobs.length; index += chunkSize) {
		chunks.push(jobs.slice(index, index + chunkSize));
	}

	const chunkResults = await Promise.all(
		chunks.map(chunk => Promise.all(chunk.map(job => runBundleSnapshotWorker(root, job)))),
	);

	for (const batch of chunkResults) {
		for (const entry of batch) {
			results.set(entry.domain, entry.bundleSnapshot);
		}
	}

	return results;
}
