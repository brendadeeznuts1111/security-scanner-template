/**
 * Central catalog of aligned Bun API wrappers.
 */
import {expect, test} from 'bun:test';
import {
	auditBunRuntimeCatalog,
	BUN_RUNTIME_CATALOG,
	BUN_RUNTIME_CATALOG_INDEX_URL,
	getBunRuntimeCatalogEntry,
} from '../../../src/utils/bun-runtime-catalog.ts';

test('catalog has unique ids and required metadata', () => {
	const ids = BUN_RUNTIME_CATALOG.map(entry => entry.id);
	expect(new Set(ids).size).toBe(ids.length);
	for (const entry of BUN_RUNTIME_CATALOG) {
		expect(entry.bunApi.length).toBeGreaterThan(0);
		expect(entry.docsUrl.startsWith('https://')).toBe(true);
		expect(entry.module.startsWith('src/')).toBe(true);
		expect(entry.exports.length).toBeGreaterThan(0);
	}
});

test('auditBunRuntimeCatalog reports availability for each wrapper', () => {
	const audit = auditBunRuntimeCatalog();
	expect(audit.entries.length).toBe(BUN_RUNTIME_CATALOG.length);
	expect(audit.entries.every(entry => typeof entry.available === 'boolean')).toBe(true);
	expect(audit.missing).toEqual(audit.entries.filter(entry => !entry.available).map(e => e.bunApi));
});

test('getBunRuntimeCatalogEntry resolves deepEquals and spawn entries', () => {
	expect(getBunRuntimeCatalogEntry('deepEquals')?.guideUrl).toContain('deep-equals');
	expect(getBunRuntimeCatalogEntry('spawn')?.guideUrl).toContain('spawn');
	expect(BUN_RUNTIME_CATALOG.map(entry => entry.id)).toContain('json5');
	expect(getBunRuntimeCatalogEntry('bunTest')?.docsUrl).toBe('https://bun.com/reference/bun/test');
});

test('catalog index URL points at runtime utils docs', () => {
	expect(BUN_RUNTIME_CATALOG_INDEX_URL).toBe('https://bun.com/docs/runtime/utils');
});