/**
 * Structured bun:test catalog and doctor/xref alignment.
 */
import {expect, test} from 'bun:test';
import {
	auditBunTestCatalog,
	BUN_TEST_API_REFERENCE_URL,
	BUN_TEST_CATALOG,
	BUN_TEST_CATALOG_GROUPS,
	getBunTestCatalogEntry,
	isBunTestAvailable,
} from '../../../src/utils/bun-test-catalog.ts';

test('catalog has unique ids and grouped APIs', () => {
	const ids = BUN_TEST_CATALOG.map(entry => entry.id);
	expect(new Set(ids).size).toBe(ids.length);
	for (const entry of BUN_TEST_CATALOG) {
		expect(entry.bunApi.length).toBeGreaterThan(0);
		expect(entry.docsUrl.startsWith('https://')).toBe(true);
		expect(entry.testModules.length).toBeGreaterThan(0);
	}
	const groupIds = BUN_TEST_CATALOG_GROUPS.map(group => group.id);
	expect(new Set(groupIds).size).toBe(groupIds.length);
	expect(BUN_TEST_CATALOG_GROUPS.map(group => group.id)).toContain('matcher-core');
});

test('auditBunTestCatalog reports availability under Bun', () => {
	const audit = auditBunTestCatalog();
	expect(isBunTestAvailable()).toBe(true);
	expect(audit.ok).toBe(true);
	expect(audit.entries.length).toBe(BUN_TEST_CATALOG.length);
	expect(audit.groups.length).toBe(BUN_TEST_CATALOG_GROUPS.length);
	expect(audit.missing).toEqual([]);
});

test('getBunTestCatalogEntry resolves setSystemTime and expect-object', () => {
	expect(getBunTestCatalogEntry('setSystemTime')?.docsUrl).toContain('setSystemTime');
	expect(getBunTestCatalogEntry('expect-object')?.testModules).toContain(
		'tests/utils/bun-expect-object-matchers.test.ts',
	);
	expect(BUN_TEST_API_REFERENCE_URL).toBe('https://bun.com/reference/bun/test');
});
