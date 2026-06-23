import {expect, test} from 'bun:test';
import {benchmark, benchmarkAll, formatBenchmarkReport} from '../../src/utils/benchmark.ts';
import {collectBenchmarkRunMetadata} from '../../src/utils/bench-metadata.ts';

test('benchmark measures async work with dual timers', async () => {
	const result = await benchmark('sleep', async () => {
		await Bun.sleep(1);
		return 42;
	});

	expect(result.result).toBe(42);
	expect(result.durationNs).toBeGreaterThan(0);
	expect(result.durationMs).toBeGreaterThan(0);
	expect(result.performanceMs).toBeGreaterThan(0);
	expect(result.iterations).toBe(1);
	expect(result.warmup).toBe(0);
});

test('benchmark supports warmup and averaged iterations', async () => {
	let calls = 0;
	const result = await benchmark(
		'counter',
		() => {
			calls++;
			return calls;
		},
		{warmup: 2, iterations: 3},
	);

	expect(result.result).toBe(5);
	expect(result.warmup).toBe(2);
	expect(result.iterations).toBe(3);
});

test('benchmark captureHeap attaches heap snapshot', async () => {
	const result = await benchmark('noop', () => undefined, {captureHeap: true});
	expect(result.heap?.objectCount).toBeGreaterThan(0);
});

test('benchmarkAll runs a suite', async () => {
	const results = await benchmarkAll({
		fast: () => 1,
		slower: async () => {
			await Bun.sleep(1);
			return 2;
		},
	});

	expect(results).toHaveLength(2);
	expect(results[0]?.name).toBeDefined();
});

test('formatBenchmarkReport shapes doctor JSON output', async () => {
	const timed = await benchmark('doctor.checkAllDomains', () => ({ok: true}), {captureHeap: true});
	const report = formatBenchmarkReport(timed, await collectBenchmarkRunMetadata({heap: true}));

	expect(report.entries).toHaveLength(1);
	expect(report.entries[0]?.name).toBe('doctor.checkAllDomains');
	expect(report.metadata?.bun.version).toBeDefined();
});
