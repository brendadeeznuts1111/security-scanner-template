/**
 * Structured catalog of bun:test runner APIs and expect matcher groups.
 * @see https://bun.com/reference/bun/test
 * @see https://bun.com/docs/test/writing-tests
 */

export const BUN_TEST_API_REFERENCE_URL = 'https://bun.com/reference/bun/test';
export const BUN_TEST_WRITING_GUIDE_URL = 'https://bun.com/docs/test/writing-tests';
export const BUN_TEST_EXPECT_REFERENCE_URL = 'https://bun.com/reference/bun/test/expect';
export const BUN_TEST_CONCURRENT_GLOB_GUIDE_URL =
	'https://bun.com/docs/guides/test/concurrent-test-glob';

export type BunTestCatalogCategory = 'runner' | 'lifecycle' | 'mock' | 'matcher' | 'config';

export interface BunTestCatalogEntry {
	id: string;
	category: BunTestCatalogCategory;
	bunApi: string;
	docsUrl: string;
	/** Test modules that exercise this API surface. */
	testModules: readonly string[];
}

export interface BunTestCatalogStatus {
	id: string;
	category: BunTestCatalogCategory;
	bunApi: string;
	available: boolean;
	docsUrl: string;
	testModules: readonly string[];
}

export interface BunTestCatalogAudit {
	ok: boolean;
	entries: BunTestCatalogStatus[];
	missing: string[];
	groups: readonly BunTestCatalogGroup[];
}

export interface BunTestCatalogGroup {
	id: string;
	label: string;
	category: BunTestCatalogCategory;
	docsUrl: string;
	apis: readonly string[];
}

const TEST_SETUP = 'tests/setup.ts';
const TEST_HELPERS = 'tests/helpers.ts';
const TEST_API = 'tests/utils/bun-test-api.test.ts';
const TEST_CORE_MATCHERS = 'tests/utils/bun-expect-core-matchers.test.ts';
const TEST_OBJECT_MATCHERS = 'tests/utils/bun-expect-object-matchers.test.ts';
const TEST_CONCURRENT_TIME = 'tests/utils/concurrent-time.test.ts';
const TEST_SERIAL = 'tests/conventions/bun-test-serial.test.ts';

export const BUN_TEST_CATALOG_GROUPS: readonly BunTestCatalogGroup[] = [
	{
		id: 'runner',
		label: 'Runner',
		category: 'runner',
		docsUrl: BUN_TEST_API_REFERENCE_URL,
		apis: [
			'test',
			'describe',
			'test.concurrent',
			'test.serial',
			'describe.serial',
			'test.each',
			'describe.each',
			'test.skip',
			'test.todo',
			'test.failing',
			'xtest',
			'xdescribe',
			'setDefaultTimeout',
		],
	},
	{
		id: 'lifecycle',
		label: 'Lifecycle hooks',
		category: 'lifecycle',
		docsUrl: 'https://bun.com/docs/test/lifecycle',
		apis: ['beforeAll', 'beforeEach', 'afterEach', 'afterAll', 'onTestFinished'],
	},
	{
		id: 'mock',
		label: 'Mocks and spies',
		category: 'mock',
		docsUrl: 'https://bun.com/docs/test/mocks',
		apis: ['mock', 'spyOn', 'vi', 'jest.fn', 'jest.useFakeTimers', 'jest.now'],
	},
	{
		id: 'matcher-core',
		label: 'Core expect matchers',
		category: 'matcher',
		docsUrl: BUN_TEST_EXPECT_REFERENCE_URL,
		apis: [
			'toBe',
			'toEqual',
			'toStrictEqual',
			'toThrow',
			'resolves',
			'rejects',
			'toHaveLength',
			'toMatch',
			'toBeCloseTo',
			'expect.hasAssertions',
			'expect.assertions',
		],
	},
	{
		id: 'matcher-object',
		label: 'Object and collection matchers',
		category: 'matcher',
		docsUrl: BUN_TEST_EXPECT_REFERENCE_URL,
		apis: [
			'toContain',
			'toContainEqual',
			'toContainKey',
			'toContainKeys',
			'toContainAllKeys',
			'toContainAnyKeys',
			'toContainValue',
			'toContainValues',
			'toContainAllValues',
			'toContainAnyValues',
		],
	},
	{
		id: 'matcher-asymmetric',
		label: 'Asymmetric matchers',
		category: 'matcher',
		docsUrl: 'https://bun.com/reference/bun/test/AsymmetricMatchers',
		apis: [
			'expect.any',
			'expect.anything',
			'expect.objectContaining',
			'expect.arrayContaining',
			'expect.stringContaining',
			'expect.stringMatching',
			'expect.closeTo',
		],
	},
	{
		id: 'config',
		label: 'Runner config',
		category: 'config',
		docsUrl: BUN_TEST_CONCURRENT_GLOB_GUIDE_URL,
		apis: ['bunfig.toml preload', 'bunfig.toml timeout', 'bunfig.toml concurrentTestGlob'],
	},
] as const;

export const BUN_TEST_CATALOG: readonly BunTestCatalogEntry[] = [
	{
		id: 'test',
		category: 'runner',
		bunApi: 'test',
		docsUrl: `${BUN_TEST_API_REFERENCE_URL}/test`,
		testModules: [TEST_API],
	},
	{
		id: 'describe',
		category: 'runner',
		bunApi: 'describe',
		docsUrl: `${BUN_TEST_API_REFERENCE_URL}/describe`,
		testModules: [TEST_API, TEST_SERIAL],
	},
	{
		id: 'test.concurrent',
		category: 'runner',
		bunApi: 'test.concurrent',
		docsUrl: `${BUN_TEST_API_REFERENCE_URL}/Test/concurrent`,
		testModules: [TEST_API],
	},
	{
		id: 'test.serial',
		category: 'runner',
		bunApi: 'test.serial',
		docsUrl: `${BUN_TEST_API_REFERENCE_URL}/Test/serial`,
		testModules: [TEST_SERIAL],
	},
	{
		id: 'describe.serial',
		category: 'runner',
		bunApi: 'describe.serial',
		docsUrl: `${BUN_TEST_API_REFERENCE_URL}/Describe/serial`,
		testModules: [TEST_SERIAL],
	},
	{
		id: 'test.each',
		category: 'runner',
		bunApi: 'test.each',
		docsUrl: `${BUN_TEST_API_REFERENCE_URL}/Test/each`,
		testModules: [TEST_API],
	},
	{
		id: 'describe.each',
		category: 'runner',
		bunApi: 'describe.each',
		docsUrl: `${BUN_TEST_API_REFERENCE_URL}/Describe/each`,
		testModules: [TEST_API],
	},
	{
		id: 'setDefaultTimeout',
		category: 'runner',
		bunApi: 'setDefaultTimeout',
		docsUrl: `${BUN_TEST_API_REFERENCE_URL}/setDefaultTimeout`,
		testModules: [TEST_API],
	},
	{
		id: 'setSystemTime',
		category: 'lifecycle',
		bunApi: 'setSystemTime',
		docsUrl: `${BUN_TEST_API_REFERENCE_URL}/setSystemTime`,
		testModules: [TEST_API, TEST_CONCURRENT_TIME, TEST_HELPERS],
	},
	{
		id: 'onTestFinished',
		category: 'lifecycle',
		bunApi: 'onTestFinished',
		docsUrl: `${BUN_TEST_API_REFERENCE_URL}/onTestFinished`,
		testModules: [TEST_API, TEST_SERIAL],
	},
	{
		id: 'mock',
		category: 'mock',
		bunApi: 'mock',
		docsUrl: `${BUN_TEST_API_REFERENCE_URL}/mock`,
		testModules: [TEST_API],
	},
	{
		id: 'spyOn',
		category: 'mock',
		bunApi: 'spyOn',
		docsUrl: `${BUN_TEST_API_REFERENCE_URL}/spyOn`,
		testModules: [TEST_API],
	},
	{
		id: 'vi',
		category: 'mock',
		bunApi: 'vi',
		docsUrl: `${BUN_TEST_API_REFERENCE_URL}/vi`,
		testModules: [TEST_API],
	},
	{
		id: 'expect-core',
		category: 'matcher',
		bunApi: 'expect (core)',
		docsUrl: BUN_TEST_EXPECT_REFERENCE_URL,
		testModules: [TEST_CORE_MATCHERS],
	},
	{
		id: 'expect-object',
		category: 'matcher',
		bunApi: 'expect (object)',
		docsUrl: BUN_TEST_EXPECT_REFERENCE_URL,
		testModules: [TEST_OBJECT_MATCHERS],
	},
	{
		id: 'bunfig',
		category: 'config',
		bunApi: 'bunfig.toml [test]',
		docsUrl: BUN_TEST_CONCURRENT_GLOB_GUIDE_URL,
		testModules: [TEST_SETUP, TEST_SERIAL],
	},
] as const;

export function isBunTestAvailable(): boolean {
	return typeof Bun !== 'undefined';
}

/** Audit bun:test catalog availability (requires Bun runtime). */
export function auditBunTestCatalog(
	catalog: readonly BunTestCatalogEntry[] = BUN_TEST_CATALOG,
): BunTestCatalogAudit {
	const available = isBunTestAvailable();
	const entries = catalog.map(entry => ({
		id: entry.id,
		category: entry.category,
		bunApi: entry.bunApi,
		available,
		docsUrl: entry.docsUrl,
		testModules: entry.testModules,
	}));
	const missing = available ? [] : ['bun:test'];
	return {
		ok: missing.length === 0,
		entries,
		missing,
		groups: BUN_TEST_CATALOG_GROUPS,
	};
}

export function getBunTestCatalogEntry(id: string): BunTestCatalogEntry | undefined {
	return BUN_TEST_CATALOG.find(entry => entry.id === id);
}