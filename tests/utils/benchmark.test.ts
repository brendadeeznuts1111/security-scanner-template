import {expect, test} from 'bun:test';
import {benchmark, benchmarkAll} from '../../src/utils/benchmark.ts';

test('benchmark measures async work', async () => {
	const result = await benchmark('sleep', async () => {
		await Bun.sleep(1);
		return 42;
	});

	expect(result.result).toBe(42);
	expect(result.durationNs).toBeGreaterThan(0);
	expect(result.durationMs).toBeGreaterThan(0);
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