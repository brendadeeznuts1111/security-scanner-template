/**
 * describe.serial / test.serial — must run outside concurrentTestGlob (not under tests/utils/).
 * @see https://bun.com/reference/bun/test/describe/serial
 */
import {describe, expect, onTestFinished, test} from 'bun:test';

describe.serial('serial describe', () => {
	let counter = 0;

	test('first serial test increments shared counter', () => {
		counter += 1;
		expect(counter).toBe(1);
	});

	test('second serial test sees prior state', () => {
		counter += 1;
		expect(counter).toBe(2);
		onTestFinished(() => {
			counter = 0;
		});
	});
});
