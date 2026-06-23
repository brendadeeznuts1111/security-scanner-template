import {expect, test} from 'bun:test';
import {
	CROSS_REF_CATALOG,
	crossRefIds,
	getCrossRef,
	getCrossRefsByCli,
	getCrossRefsByConfigField,
	getCrossRefsByFeature,
	getCrossRefsByLayer,
	getCrossRefsByModule,
	getCrossRefsReferencing,
	getFeatureCrossRefMap,
	getRelatedCrossRefs,
	listCrossRefs,
	planCrossRefLoop,
	validateCrossRefApis,
	validateCrossRefCatalog,
	walkCrossRefLoop,
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

test('getCrossRef returns bun.run.filter with runtime docs', () => {
	const entry = getCrossRef('bun.run.filter');
	expect(entry?.docsUrl).toBe('https://bun.com/docs/runtime#filtering');
	expect(entry?.exports).toContain('formatBunRunFilterCommand');
	expect(entry?.modules).toContain('src/utils/bun-run-filter.ts');
});

test('getCrossRef returns bun.test with catalog and helper exports', () => {
	const entry = getCrossRef('bun.test');
	expect(entry?.bunApi).toBe('bun:test');
	expect(entry?.docsUrl).toBe('https://bun.com/reference/bun/test');
	expect(entry?.exports).toContain('auditBunTestCatalog');
	expect(entry?.modules).toContain('src/utils/bun-test-catalog.ts');
	expect(entry?.modules).toContain('tests/xref/xref.test.ts');
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
	expect(crossRefIds(getRelatedCrossRefs('bun.transpiler'))).toContain('bun.bundle.features');
	expect(crossRefIds(getRelatedCrossRefs('html.rewriter'))).toContain('bun.webview');
});

test('getCrossRefsByFeature maps AUDIT_SQLITE', () => {
	expect(crossRefIds(getCrossRefsByFeature('AUDIT_SQLITE'))).toContain('feature.audit-sqlite');
});

test('getCrossRefsByLayer returns scanning APIs', () => {
	const ids = crossRefIds(getCrossRefsByLayer('scanning'));
	expect(ids).toContain('bun.spawn');
	expect(ids).toContain('bun.terminal');
});

test('getCrossRefsByModule finds scan tools', () => {
	expect(crossRefIds(getCrossRefsByModule('src/scan/tools.ts'))).toContain('bun.spawn');
});

test('getCrossRefsByConfigField resolves service.interactive', () => {
	const ids = crossRefIds(getCrossRefsByConfigField('service.interactive'));
	expect(ids).toContain('bun.terminal');
	expect(ids).toContain('service.interactive');
});

test('getCrossRefsByConfigField resolves audit.jsonl.path', () => {
	expect(crossRefIds(getCrossRefsByConfigField('audit.jsonl.path'))).toContain(
		'feature.audit-jsonl',
	);
});

test('getCrossRefsByCli resolves scan interactive', () => {
	expect(crossRefIds(getCrossRefsByCli('scan interactive'))).toContain('bun.terminal');
});

test('getRelatedCrossRefs follows bun.terminal links', () => {
	const ids = crossRefIds(getRelatedCrossRefs('bun.terminal'));
	expect(ids).toContain('bun.spawn');
	expect(ids).toContain('service.interactive');
});

test('getCrossRefsReferencing finds backlinks to bun.spawn', () => {
	expect(crossRefIds(getCrossRefsReferencing('bun.spawn'))).toContain('bun.terminal');
});

test('walkCrossRefLoop traverses audit uuid graph', () => {
	const loop = crossRefIds(walkCrossRefLoop('bun.randomUUIDv7'));
	expect(loop).toContain('feature.audit-jsonl');
	expect(loop).toContain('feature.audit-sqlite');
});

test('walkCrossRefLoop bidirectional reaches bun.spawn from bun.terminal', () => {
	const loop = crossRefIds(
		walkCrossRefLoop('bun.terminal', {bidirectional: true, includeStart: true}),
	);
	expect(loop).toContain('bun.spawn');
	expect(loop).toContain('service.interactive');
});

test('planCrossRefLoop respects depth limit', () => {
	const steps = planCrossRefLoop('bun.nanoseconds', {maxDepth: 1, includeStart: true});
	expect(steps.some(step => step.id === 'bun.nanoseconds' && step.depth === 0)).toBe(true);
	expect(steps.every(step => step.depth <= 1)).toBe(true);
});

test('getFeatureCrossRefMap includes every feature', () => {
	const map = getFeatureCrossRefMap();
	for (const feature of ['AUDIT_SQLITE', 'FEED_WEBSOCKET'] as const) {
		expect(map[feature].length).toBeGreaterThan(0);
	}
});

test('listCrossRefs filters required runtime APIs', () => {
	const required = listCrossRefs({required: true});
	expect(crossRefIds(required)).toContain('bun.csrf');
	expect(required.every(entry => entry.required)).toBe(true);
});

test('validateCrossRefCatalog reports no unknown related ids', () => {
	const catalog = validateCrossRefCatalog();
	expect(catalog.unknownRelated).toEqual([]);
	expect(catalog.ok).toBe(true);
});

test('validateCrossRefApis reports required APIs and catalog health', () => {
	const result = validateCrossRefApis();
	expect(result.entries.length).toBeGreaterThan(0);
	expect(result.catalog.ok).toBe(true);
	expect(result.requiredMissing).not.toContain('bun.spawn');
	expect(result.requiredMissing).not.toContain('bun.csrf');
	expect(result.ok).toBe(true);
});