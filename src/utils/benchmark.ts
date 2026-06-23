import {nanoseconds} from './runtime.ts';

export interface BenchmarkResult<T> {
	name: string;
	result: T;
	durationNs: number;
	durationMs: number;
}

/**
 * Measure a synchronous or async operation with Bun.nanoseconds precision.
 */
export async function benchmark<T>(
	name: string,
	fn: () => T | Promise<T>,
): Promise<BenchmarkResult<T>> {
	const start = nanoseconds();
	const result = await fn();
	const durationNs = nanoseconds() - start;
	return {
		name,
		result,
		durationNs,
		durationMs: durationNs / 1_000_000,
	};
}

/**
 * Run multiple named benchmarks and return sorted results.
 */
export async function benchmarkAll(
	suite: Record<string, () => unknown | Promise<unknown>>,
): Promise<BenchmarkResult<unknown>[]> {
	const results: BenchmarkResult<unknown>[] = [];
	for (const [name, fn] of Object.entries(suite)) {
		results.push(await benchmark(name, fn));
	}
	return results.sort((a, b) => b.durationNs - a.durationNs);
}
