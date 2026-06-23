import {
	captureBenchmarkHeapStats,
	type BenchmarkHeapSnapshot,
	type BenchmarkRunMetadata,
} from './bench-metadata.ts';
import {nanoseconds} from './runtime.ts';

export interface BenchmarkOptions {
	/** Discarded warmup iterations before the timed run. */
	warmup?: number;
	/** Timed iterations; when > 1, durations are averaged. */
	iterations?: number;
	/** Capture `bun:jsc` heap stats after the timed run. */
	captureHeap?: boolean;
}

export interface BenchmarkResult<T> {
	name: string;
	result: T;
	durationNs: number;
	durationMs: number;
	/** Wall-clock duration from `performance.now()`. */
	performanceMs: number;
	iterations: number;
	warmup: number;
	heap?: BenchmarkHeapSnapshot;
}

export interface BenchmarkReportEntry {
	name: string;
	durationNs: number;
	durationMs: number;
	performanceMs: number;
	iterations: number;
	warmup: number;
	heap?: BenchmarkHeapSnapshot;
}

export interface BenchmarkReport {
	metadata?: BenchmarkRunMetadata;
	entries: BenchmarkReportEntry[];
}

function performanceMsSince(startMs: number): number {
	return performance.now() - startMs;
}

async function runTimed<T>(
	fn: () => T | Promise<T>,
	warmup: number,
	iterations: number,
): Promise<{result: T; durationNs: number; performanceMs: number}> {
	for (let i = 0; i < warmup; i++) {
		await fn();
	}

	let totalNs = 0;
	let totalPerfMs = 0;
	let result!: T;

	for (let i = 0; i < iterations; i++) {
		const perfStart = performance.now();
		const nsStart = nanoseconds();
		result = await fn();
		totalNs += nanoseconds() - nsStart;
		totalPerfMs += performanceMsSince(perfStart);
	}

	return {
		result,
		durationNs: totalNs / iterations,
		performanceMs: totalPerfMs / iterations,
	};
}

/**
 * Measure a synchronous or async operation with Bun.nanoseconds and performance.now.
 */
export async function benchmark<T>(
	name: string,
	fn: () => T | Promise<T>,
	options: BenchmarkOptions = {},
): Promise<BenchmarkResult<T>> {
	const warmup = Math.max(0, options.warmup ?? 0);
	const iterations = Math.max(1, options.iterations ?? 1);
	const timed = await runTimed(fn, warmup, iterations);
	const heap = options.captureHeap === true ? captureBenchmarkHeapStats() : undefined;

	return {
		name,
		result: timed.result,
		durationNs: timed.durationNs,
		durationMs: timed.durationNs / 1_000_000,
		performanceMs: timed.performanceMs,
		iterations,
		warmup,
		heap,
	};
}

/**
 * Run multiple named benchmarks and return sorted results (slowest first).
 */
export async function benchmarkAll(
	suite: Record<string, () => unknown | Promise<unknown>>,
	options: BenchmarkOptions = {},
): Promise<BenchmarkResult<unknown>[]> {
	const results: BenchmarkResult<unknown>[] = [];
	for (const [name, fn] of Object.entries(suite)) {
		results.push(await benchmark(name, fn, options));
	}
	return results.sort((a, b) => b.durationNs - a.durationNs);
}

function toReportEntry(result: BenchmarkResult<unknown>): BenchmarkReportEntry {
	return {
		name: result.name,
		durationNs: result.durationNs,
		durationMs: result.durationMs,
		performanceMs: result.performanceMs,
		iterations: result.iterations,
		warmup: result.warmup,
		heap: result.heap,
	};
}

/**
 * Shape benchmark results for doctor/CLI JSON output.
 */
export function formatBenchmarkReport(
	results: BenchmarkResult<unknown> | BenchmarkResult<unknown>[],
	metadata?: BenchmarkRunMetadata,
): BenchmarkReport {
	const list = Array.isArray(results) ? results : [results];
	return {
		metadata,
		entries: list.map(toReportEntry),
	};
}
