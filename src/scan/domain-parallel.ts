import {checkLoadedDomain} from '../config/doctor.ts';
import type {DoctorIssue} from '../config/doctor.ts';
import type {LoadedDomain} from '../config/types.ts';

export interface DomainCheckResult {
	domain: string;
	path: string;
	ok: boolean;
	issues: DoctorIssue[];
}

export interface ParallelDomainScanOptions {
	enabled?: boolean;
	workerCount?: number;
	/** Minimum domain count before fan-out (default: 2). */
	threshold?: number;
}

const DEFAULT_THRESHOLD = 2;
const DEFAULT_WORKER_COUNT = 2;
const WORKER_TIMEOUT_MS = 60_000;

function chunkDomains<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

function runDomainWorker(loaded: LoadedDomain): Promise<DomainCheckResult> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL('./domain-worker.ts', import.meta.url));
		const timeout = setTimeout(() => {
			worker.terminate();
			reject(new Error(`Domain worker timed out for ${loaded.domain}`));
		}, WORKER_TIMEOUT_MS);

		worker.onmessage = (event: MessageEvent<DomainCheckResult>) => {
			clearTimeout(timeout);
			worker.terminate();
			resolve(event.data);
		};

		worker.onerror = error => {
			clearTimeout(timeout);
			worker.terminate();
			reject(error);
		};

		worker.postMessage(loaded);
	});
}

async function checkDomainAsync(loaded: LoadedDomain): Promise<DomainCheckResult> {
	const result = await checkLoadedDomain(loaded);
	return {
		domain: loaded.domain,
		path: loaded.path,
		ok: result.ok,
		issues: result.issues,
	};
}

/**
 * Validate multiple loaded domains, fanning out across Workers when beneficial.
 */
export async function checkDomainsParallel(
	loadedDomains: LoadedDomain[],
	options: ParallelDomainScanOptions = {},
): Promise<DomainCheckResult[]> {
	const threshold = options.threshold ?? DEFAULT_THRESHOLD;
	const enabled = options.enabled ?? loadedDomains.length >= threshold;

	if (!enabled || loadedDomains.length < threshold) {
		return Promise.all(loadedDomains.map(checkDomainAsync));
	}

	const workerCount = Math.max(1, options.workerCount ?? DEFAULT_WORKER_COUNT);
	const chunkSize = Math.max(1, Math.ceil(loadedDomains.length / workerCount));
	const chunks = chunkDomains(loadedDomains, chunkSize);

	const results: DomainCheckResult[] = [];
	for (const chunk of chunks) {
		const chunkResults = await Promise.all(chunk.map(runDomainWorker));
		results.push(...chunkResults);
	}

	return results.sort((a, b) => a.domain.localeCompare(b.domain));
}
