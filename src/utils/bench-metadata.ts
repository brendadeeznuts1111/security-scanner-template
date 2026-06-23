import {heapStats} from 'bun:jsc';
import {extractPackageMetadata, type PackageMetadata} from '../config/package-metadata.ts';
import {getRuntimeInfo} from './runtime.ts';

export interface BenchmarkHeapSnapshot {
	heapSize: number;
	heapCapacity: number;
	extraMemorySize: number;
	objectCount: number;
}

export interface BenchmarkProfilingHints {
	cpuProfMd: string;
	heapProfMd: string;
	mimallocStatsEnv: string;
	docsUrl: string;
}

export interface BenchmarkRunMetadata {
	bun: {
		version: string;
		revision: string;
		main: string;
	};
	/** Web `performance.timeOrigin` for converting Bun.nanoseconds() to wall time. */
	timeOrigin: number;
	heap?: BenchmarkHeapSnapshot;
	package?: PackageMetadata | null;
	profiling: BenchmarkProfilingHints;
}

export const BENCHMARK_RUNNER_ENV = 'BENCHMARK_RUNNER';
export const MIMALLOC_STATS_ENV = 'MIMALLOC_SHOW_STATS';

export const BENCHMARK_PROFILING_HINTS: BenchmarkProfilingHints = {
	cpuProfMd: '--cpu-prof-md',
	heapProfMd: '--heap-prof-md',
	mimallocStatsEnv: MIMALLOC_STATS_ENV,
	docsUrl: 'https://bun.sh/docs/project/benchmarking',
};

/**
 * Summarize JavaScript heap usage via `bun:jsc` (see Bun benchmarking docs).
 */
export function captureBenchmarkHeapStats(): BenchmarkHeapSnapshot | undefined {
	try {
		const stats = heapStats();
		return {
			heapSize: stats.heapSize,
			heapCapacity: stats.heapCapacity,
			extraMemorySize: stats.extraMemorySize,
			objectCount: stats.objectCount,
		};
	} catch {
		return undefined;
	}
}

/**
 * Collect run metadata for doctor/CLI benchmark JSON output.
 */
export async function collectBenchmarkRunMetadata(options?: {
	heap?: boolean;
	packageJsonPath?: string;
}): Promise<BenchmarkRunMetadata> {
	const runtime = getRuntimeInfo();
	return {
		bun: runtime,
		timeOrigin: performance.timeOrigin,
		heap: options?.heap === true ? captureBenchmarkHeapStats() : undefined,
		package: options?.packageJsonPath
			? await extractPackageMetadata(options.packageJsonPath)
			: undefined,
		profiling: BENCHMARK_PROFILING_HINTS,
	};
}

/**
 * True when mitata runner should emit JSON (`BENCHMARK_RUNNER=1`).
 */
export function isBenchmarkRunnerMode(env: NodeJS.ProcessEnv = process.env): boolean {
	return env[BENCHMARK_RUNNER_ENV] === '1';
}
