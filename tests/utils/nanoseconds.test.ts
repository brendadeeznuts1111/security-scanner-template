/**
 * @see https://bun.com/docs/guides/process/nanoseconds
 */
import {expect, test} from 'bun:test';
import {createTimer} from '../../src/utils/timing.ts';
import {
	BUN_NANOSECONDS_GUIDE_URL,
	isNanosecondsAvailable,
	nanoseconds,
} from '../../src/utils/nanoseconds.ts';

test('nanoseconds returns monotonic process uptime', () => {
	const a = nanoseconds();
	const b = nanoseconds();
	expect(Number.isInteger(a)).toBe(true);
	expect(a).toBeGreaterThan(0);
	expect(b).toBeGreaterThanOrEqual(a);
});

test('createTimer measures elapsed nanoseconds', () => {
	const timer = createTimer();
	const elapsed = timer.elapsedNs();
	expect(elapsed).toBeGreaterThanOrEqual(0);
	expect(timer.elapsedMs()).toBeGreaterThanOrEqual(0);
});

test('isNanosecondsAvailable reflects Bun.nanoseconds presence', () => {
	expect(isNanosecondsAvailable()).toBe(typeof Bun.nanoseconds === 'function');
});

test('docs URL points at nanoseconds guide', () => {
	expect(BUN_NANOSECONDS_GUIDE_URL).toBe('https://bun.com/docs/guides/process/nanoseconds');
});
