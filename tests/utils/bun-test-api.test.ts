/**
 * Conformance checks for bun:test APIs used across this repo (no jest namespace).
 * @see https://bun.com/reference/bun/test
 * @see https://bun.com/docs/guides/test/migrate-from-jest
 */
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	mock,
	onTestFinished,
	setDefaultTimeout,
	setSystemTime,
	spyOn,
	test,
} from 'bun:test';
import {BUN_TEST_API_REFERENCE_URL} from '../../src/utils/bun-test-catalog.ts';
import {FIXED_TEST_DATE, FIXED_TEST_ISO, FIXED_TEST_MS} from '../helpers.ts';

describe('bun:test module surface', () => {
	test('reference URL points at bun.com/reference/bun/test', () => {
		expect(BUN_TEST_API_REFERENCE_URL).toBe('https://bun.com/reference/bun/test');
	});

	test('exports core runner APIs', () => {
		expect(typeof test).toBe('function');
		expect(typeof describe).toBe('function');
		expect(typeof expect).toBe('function');
		expect(typeof mock).toBe('function');
		expect(typeof spyOn).toBe('function');
		expect(typeof setSystemTime).toBe('function');
		expect(typeof setDefaultTimeout).toBe('function');
		expect(typeof beforeAll).toBe('function');
		expect(typeof beforeEach).toBe('function');
		expect(typeof afterEach).toBe('function');
		expect(typeof afterAll).toBe('function');
		expect(typeof onTestFinished).toBe('function');
	});

	test('test and describe modifiers are functions', () => {
		expect(typeof test.concurrent).toBe('function');
		expect(typeof test.serial).toBe('function');
		expect(typeof describe.serial).toBe('function');
		expect(typeof describe.each).toBe('function');
	});
});

describe('setSystemTime', () => {
	afterEach(() => {
		setSystemTime();
	});

	test('top-level export freezes Date.now and Intl formatting', () => {
		setSystemTime(FIXED_TEST_DATE);
		expect(Date.now()).toBe(FIXED_TEST_MS);
		expect(new Date().toISOString()).toBe(FIXED_TEST_ISO);
		expect(new Intl.DateTimeFormat('en-US', {timeZone: 'UTC'}).format(FIXED_TEST_DATE)).toBe(
			'6/23/2026',
		);
	});

	test('reset restores real clock when called with no argument', () => {
		const before = Date.now();
		setSystemTime(FIXED_TEST_DATE);
		setSystemTime();
		expect(Date.now()).toBeGreaterThanOrEqual(before);
		expect(Date.now()).not.toBe(FIXED_TEST_MS);
	});
});

describe('mock and spyOn', () => {
	test('mock records calls and return values', () => {
		const doubled = mock((value: number) => value * 2);
		expect(doubled(2)).toBe(4);
		expect(doubled).toHaveBeenCalledWith(2);
	});

	test('spyOn wraps object methods', () => {
		const target = {run: (n: number) => n + 1};
		const spied = spyOn(target, 'run');
		expect(target.run(3)).toBe(4);
		expect(spied).toHaveBeenCalledWith(3);
		spied.mockRestore();
	});
});

describe('expect asymmetric matchers', () => {
	test('any, objectContaining, and stringContaining', () => {
		expect({id: 1, label: 'alpha'}).toEqual(
			expect.objectContaining({id: expect.any(Number)}),
		);
		expect('hello world').toEqual(expect.stringContaining('world'));
		expect([1, 2, 3]).toEqual(expect.arrayContaining([2]));
	});
});

describe('timeouts', () => {
	test('setDefaultTimeout overrides file default', () => {
		setDefaultTimeout(10_000);
		expect(true).toBe(true);
		setDefaultTimeout(5000);
	});

	test(
		'per-test timeout via third argument',
		async () => {
			await Bun.sleep(1);
			expect(true).toBe(true);
		},
		5000,
	);
});

describe.serial('serial describe under concurrent glob', () => {
	let counter = 0;

	afterAll(() => {
		counter = 0;
	});

	test('first serial test increments shared counter', () => {
		counter += 1;
		expect(counter).toBe(1);
	});

	test('second serial test sees prior state', () => {
		counter += 1;
		expect(counter).toBe(2);
	});
});