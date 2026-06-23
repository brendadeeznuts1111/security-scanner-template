import type {AllowlistItem, ThreatFeedItem} from '../provider/validator.ts';
import {matchThreats, type ThreatMatch} from './matcher.ts';

const PARALLEL_THRESHOLD = 8;
const CHUNK_SIZE = 16;

export interface ParallelScanOptions {
	enabled?: boolean;
	workerCount?: number;
}

function chunkPackages<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

function runWorker(input: {
	packages: Bun.Security.Package[];
	rules: ThreatFeedItem[];
	allowlist: AllowlistItem[];
}): Promise<ThreatMatch[]> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL('./threat-worker.ts', import.meta.url));
		const timeout = setTimeout(() => {
			worker.terminate();
			reject(new Error('Threat worker timed out'));
		}, 30_000);

		worker.onmessage = (event: MessageEvent<ThreatMatch[]>) => {
			clearTimeout(timeout);
			worker.terminate();
			resolve(event.data);
		};

		worker.onerror = error => {
			clearTimeout(timeout);
			worker.terminate();
			reject(error);
		};

		worker.postMessage(input);
	});
}

/**
 * Match packages against a threat feed, optionally fanning out across Workers.
 */
export async function matchThreatsParallel(
	packages: Bun.Security.Package[],
	rules: ThreatFeedItem[],
	allowlist: AllowlistItem[],
	options: ParallelScanOptions = {},
): Promise<ThreatMatch[]> {
	const enabled = options.enabled ?? packages.length >= PARALLEL_THRESHOLD;
	if (!enabled) {
		return matchThreats({packages, rules, allowlist});
	}

	const workerCount = Math.max(1, options.workerCount ?? 2);
	const chunks = chunkPackages(packages, Math.ceil(packages.length / workerCount));
	const chunkResults = await Promise.all(
		chunks.map(chunk => runWorker({packages: chunk, rules, allowlist})),
	);

	const merged = new Map<string, ThreatMatch>();
	for (const matches of chunkResults) {
		for (const match of matches) {
			const existing = merged.get(match.item.package);
			if (existing) {
				existing.matchingPackages.push(...match.matchingPackages);
			} else {
				merged.set(match.item.package, {
					item: match.item,
					matchingPackages: [...match.matchingPackages],
				});
			}
		}
	}

	return Array.from(merged.values());
}
