import {expect, test} from 'bun:test';
import {createTimer} from '../../src/utils/timing.ts';
import {sleep} from '../../src/utils/rate-limit.ts';

test('createTimer measures elapsed time', async () => {
	const timer = createTimer();
	await sleep(20);
	expect(timer.elapsedMs()).toBeGreaterThanOrEqual(15);
	expect(timer.elapsedNs()).toBeGreaterThan(0);
});
