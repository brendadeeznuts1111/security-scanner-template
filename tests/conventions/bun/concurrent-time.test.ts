/**
 * Time helpers + preload cleanup (see tests/setup.ts).
 * @see https://bun.com/reference/bun/test/setSystemTime
 * @see https://bun.com/docs/test/writing-tests#timeouts
 */
import {describe, expect, test} from 'bun:test';
import {
	FIXED_TEST_ISO,
	FIXED_TEST_MS,
	freezeSystemTime,
	resetSystemTime,
	withFixedSystemTime,
} from '../../helpers.ts';

const PAST_ISO = '2020-01-01T00:00:00.000Z';
const PAST_MS = new Date(PAST_ISO).getTime();

describe('setSystemTime', () => {
	test('freezes Date.now and new Date()', () => {
		const before = Date.now();
		freezeSystemTime(PAST_ISO);
		expect(Date.now()).toBe(PAST_MS);
		expect(new Date().toISOString()).toBe(PAST_ISO);
		resetSystemTime();
		expect(Date.now()).toBeGreaterThanOrEqual(before);
		expect(Date.now()).not.toBe(PAST_MS);
	});

	test('withFixedSystemTime restores clock after fn', async () => {
		const before = Date.now();
		await withFixedSystemTime(() => {
			expect(new Date().getUTCFullYear()).toBe(2026);
		}, FIXED_TEST_ISO);
		expect(Date.now()).toBeGreaterThanOrEqual(before);
		expect(Date.now()).not.toBe(FIXED_TEST_MS);
	});
});

describe('timezone', () => {
	test('setup pins TZ to UTC', () => {
		expect(process.env.TZ).toBe('UTC');
		expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC');
	});
});
