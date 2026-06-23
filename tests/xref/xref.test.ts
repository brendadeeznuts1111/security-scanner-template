import {expect, test} from 'bun:test';
import {
	CROSS_REF_CATALOG,
	getCrossRef,
	getCrossRefsByCli,
	getCrossRefsByConfigField,
	getCrossRefsByFeature,
	getCrossRefsByLayer,
	getCrossRefsByModule,
	getFeatureCrossRefMap,
	getRelatedCrossRefs,
	listCrossRefs,
	validateCrossRefApis,
} from '../../src/xref/index.ts';

test('CROSS_REF_CATALOG has unique ids', () => {
	const ids = CROSS_REF_CATALOG.map(entry => entry.id);
	expect(new Set(ids).size).toBe(ids.length);
});

test('getCrossRef returns bun.terminal entry', () => {
	const entry = getCrossRef('bun.terminal');
	expect(entry?.bunApi).toBe('Bun.spawn({ terminal })');
	expect(entry?.configFields).toContain('service.interactive');
	expect(entry?.cliCommands).toContain('scan interactive');
});

test('getCrossRef returns bun.transpiler with bundle scanning exports', () => {
	const entry = getCrossRef('bun.transpiler');
	expect(entry?.exports).toContain('scanBundle');
	expect(entry?.modules).toContain('src/scan/transpiler.ts');
});

test('getCrossRef returns bun.deepEquals with guide docs and drift exports', () => {
	const entry = getCrossRef('bun.deepEquals');
	expect(entry?.bunApi).toBe('Bun.deepEquals');
	expect(entry?.docsUrl).toBe('https://bun.com/docs/guides/util/deep-equals');
	expect(entry?.exports).toContain('deepEqualsStrict');
	expect(entry?.modules).toContain('src/utils/deep-equal.ts');
});

test('getCrossRef returns bun.peek and bun.inspect runtime entries', () => {
	expect(getCrossRef('bun.peek')?.modules).toContain('src/utils/peek.ts');
	expect(getCrossRef('bun.inspect')?.docsUrl).toContain('bun-inspect');
	expect(getCrossRef('bun.spawn')?.docsUrl).toBe('https://bun.com/docs/guides/process/spawn');
});

test('getCrossRef returns escapeHTML nanoseconds and signals guide entries', () => {
	expect(getCrossRef('bun.escapeHTML')?.docsUrl).toBe(
		'https://bun.com/docs/guides/util/escape-html',
	);
	expect(getCrossRef('bun.nanoseconds')?.docsUrl).toBe(
		'https://bun.com/docs/guides/process/nanoseconds',
	);
	expect(getCrossRef('utils.signals')?.docsUrl).toBe(
		'https://bun.com/docs/guides/process/os-signals',
	);
});

test('getRelatedCrossRefs links transpiler to workers and html to webview', () => {
	expect(
		getRelatedCrossRefs('bun.transpiler').some(entry => entry.id === 'bun.bundle.features'),
	).toBe(true);
	expect(getRelatedCrossRefs('html.rewriter').some(entry => entry.id === 'bun.webview')).toBe(true);
});

test('getCrossRefsByFeature maps AUDIT_SQLITE', () => {
	const entries = getCrossRefsByFeature('AUDIT_SQLITE');
	expect(entries.some(entry => entry.id === 'feature.audit-sqlite')).toBe(true);
});

test('getCrossRefsByLayer returns scanning APIs', () => {
	const entries = getCrossRefsByLayer('scanning');
	expect(entries.some(entry => entry.id === 'bun.spawn')).toBe(true);
	expect(entries.some(entry => entry.id === 'bun.terminal')).toBe(true);
});

test('getCrossRefsByModule finds scan tools', () => {
	const entries = getCrossRefsByModule('src/scan/tools.ts');
	expect(entries.some(entry => entry.id === 'bun.spawn')).toBe(true);
});

test('getCrossRefsByConfigField resolves service.interactive', () => {
	const entries = getCrossRefsByConfigField('service.interactive');
	expect(entries.some(entry => entry.id === 'bun.terminal')).toBe(true);
	expect(entries.some(entry => entry.id === 'service.interactive')).toBe(true);
});

test('getCrossRefsByConfigField resolves audit.jsonl.path', () => {
	const entries = getCrossRefsByConfigField('audit.jsonl.path');
	expect(entries.some(entry => entry.id === 'feature.audit-jsonl')).toBe(true);
});

test('getCrossRefsByCli resolves scan interactive', () => {
	const entries = getCrossRefsByCli('scan interactive');
	expect(entries.some(entry => entry.id === 'bun.terminal')).toBe(true);
});

test('getRelatedCrossRefs follows bun.terminal links', () => {
	const related = getRelatedCrossRefs('bun.terminal');
	expect(related.some(entry => entry.id === 'bun.spawn')).toBe(true);
	expect(related.some(entry => entry.id === 'service.interactive')).toBe(true);
});

test('getFeatureCrossRefMap includes every feature', () => {
	const map = getFeatureCrossRefMap();
	for (const feature of ['AUDIT_SQLITE', 'FEED_WEBSOCKET'] as const) {
		expect(map[feature].length).toBeGreaterThan(0);
	}
});

test('listCrossRefs filters required runtime APIs', () => {
	const required = listCrossRefs({required: true});
	expect(required.some(entry => entry.id === 'bun.csrf')).toBe(true);
	expect(required.every(entry => entry.required)).toBe(true);
});

test('validateCrossRefApis reports required APIs', () => {
	const result = validateCrossRefApis();
	expect(result.entries.length).toBeGreaterThan(0);
	expect(result.requiredMissing).not.toContain('bun.spawn');
	expect(result.requiredMissing).not.toContain('bun.csrf');
});
