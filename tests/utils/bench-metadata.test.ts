import {expect, test} from 'bun:test';
import {
	BENCHMARK_RUNNER_ENV,
	captureBenchmarkHeapStats,
	collectBenchmarkRunMetadata,
	isBenchmarkRunnerMode,
} from '../../src/utils/bench-metadata.ts';

test('captureBenchmarkHeapStats returns positive object counts', () => {
	const heap = captureBenchmarkHeapStats();
	expect(heap).toBeDefined();
	expect(heap!.objectCount).toBeGreaterThan(0);
	expect(heap!.heapSize).toBeGreaterThan(0);
});

test('collectBenchmarkRunMetadata includes bun runtime and profiling hints', async () => {
	const metadata = await collectBenchmarkRunMetadata({
		heap: true,
		packageJsonPath: `${process.cwd()}/package.json`,
	});

	expect(metadata.bun.version).toMatch(/\d+\.\d+\.\d+/);
	expect(metadata.bun.revision.length).toBeGreaterThan(0);
	expect(metadata.timeOrigin).toBeGreaterThan(0);
	expect(metadata.heap?.objectCount).toBeGreaterThan(0);
	expect(metadata.package?.name).toBe('@acme/bun-security-scanner');
	expect(metadata.profiling.docsUrl).toContain('benchmarking');
});

test('isBenchmarkRunnerMode reads BENCHMARK_RUNNER env', () => {
	expect(isBenchmarkRunnerMode({[BENCHMARK_RUNNER_ENV]: '1'})).toBe(true);
	expect(isBenchmarkRunnerMode({})).toBe(false);
});
