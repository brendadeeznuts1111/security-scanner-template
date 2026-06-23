/**
 * Conformance checks for bun:test APIs used across this repo.
 * @see https://bun.com/reference/bun/test
 * @see https://bun.com/docs/guides/test/migrate-from-jest
 */
import {
	afterEach,
	describe,
	expect,
	mock,
	onTestFinished,
	setDefaultTimeout,
	setSystemTime,
	spyOn,
	test,
	vi,
	xdescribe,
	xtest,
} from 'bun:test';
import {
	auditBunTestCatalog,
	BUN_TEST_API_REFERENCE_URL,
} from '../../../src/utils/bun-test-catalog.ts';
import {FIXED_TEST_DATE, FIXED_TEST_ISO, FIXED_TEST_MS} from '../../helpers.ts';

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
		expect(typeof onTestFinished).toBe('function');
		expect(typeof vi).toBe('object');
		expect(typeof xtest).toBe('function');
		expect(typeof xdescribe).toBe('function');
	});

	test('test and describe modifiers are functions', () => {
		expect(typeof test.concurrent).toBe('function');
		expect(typeof test.serial).toBe('function');
		expect(typeof test.each).toBe('function');
		expect(typeof test.skip).toBe('function');
		expect(typeof test.todo).toBe('function');
		expect(typeof test.failing).toBe('function');
		expect(typeof describe.serial).toBe('function');
		expect(typeof describe.each).toBe('function');
	});

	test('catalog audit is ok under Bun', () => {
		const audit = auditBunTestCatalog();
		expect(audit.ok).toBe(true);
		expect(audit.groups.map(group => group.id)).toContain('matcher-core');
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
		expect(doubled).toHaveReturnedWith(4);
	});

	test('spyOn wraps object methods', () => {
		const target = {run: (n: number) => n + 1};
		const spied = spyOn(target, 'run');
		expect(target.run(3)).toBe(4);
		expect(spied).toHaveBeenCalledWith(3);
		spied.mockRestore();
	});
});

describe('vi fake timers', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	test('vi.useFakeTimers pins Date.now', () => {
		vi.useFakeTimers({now: FIXED_TEST_MS});
		expect(Date.now()).toBe(FIXED_TEST_MS);
	});

	test('vi.fn records invocations', () => {
		const fn = vi.fn((n: number) => n * 3);
		expect(fn(2)).toBe(6);
		expect(fn).toHaveBeenCalledTimes(1);
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

describe('test.each and describe.each', () => {
	test.each([
		[1, 2, 3],
		[0, 0, 0],
	])('adds %i + %i to %i', (a, b, sum) => {
		expect(a + b).toBe(sum);
	});

	describe.each([
		['alpha', 5],
		['beta', 4],
	])('string length for %s', (label, length) => {
		test('matches expected character count', () => {
			expect(label).toHaveLength(length);
		});
	});
});

describe('onTestFinished', () => {
	test.serial('registers cleanup after test body', () => {
		let cleaned = false;
		onTestFinished(() => {
			cleaned = true;
		});
		expect(cleaned).toBe(false);
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

describe('skip and failing modifiers', () => {
	test.skip('skipped test does not run', () => {
		expect(true).toBe(false);
	});

	xtest('xtest alias is skip', () => {
		expect(true).toBe(false);
	});

	test.failing('failing test passes when assertion fails', () => {
		expect(1).toBe(2);
	});
});