import {expect, test} from 'bun:test';
import {getCrossRef} from '../../src/xref/index.ts';
import {
	auditGroundTruthCatalog,
	formatGroundTruthLoopTable,
	formatRepoRefUrl,
	getGroundTruthForWorkflowScanner,
	GROUND_TRUTH_CATALOG,
	GROUND_TRUTH_REQUIRED_XREF_IDS,
	planGroundTruthLoop,
	validateGroundTruthCatalog,
} from '../../src/utils/ground-truth-catalog.ts';

test('GROUND_TRUTH_CATALOG links to real xref ids', () => {
	const validation = validateGroundTruthCatalog(id => getCrossRef(id) !== undefined);
	expect(validation.ok).toBe(true);
	expect(validation.unknownXrefIds).toEqual([]);
});

test('workflow.loop has bun and effect repo references', () => {
	const steps = planGroundTruthLoop('workflow.loop');
	expect(steps.filter(step => step.kind === 'repo-ref').length).toBeGreaterThanOrEqual(5);
	const entry = GROUND_TRUTH_CATALOG.find(e => e.xrefId === 'workflow.loop')!;
	expect(entry.refs.some(ref => ref.repo === 'bun' && ref.path.includes('watch'))).toBe(true);
	expect(entry.refs.some(ref => ref.repo === 'effect' && ref.path.includes('Schedule'))).toBe(true);
});

test('getGroundTruthForWorkflowScanner resolves semver scanner', () => {
	expect(getGroundTruthForWorkflowScanner('semver')?.xrefId).toBe('intel.semver');
	expect(getGroundTruthForWorkflowScanner('dns')?.xrefId).toBe('feature.intel-dns');
});

test('formatGroundTruthLoopTable renders repo-ref urls', () => {
	const table = formatGroundTruthLoopTable(planGroundTruthLoop('intel.tls'));
	expect(table).toContain('Ground-truth loop');
	expect(table).toContain('github.com');
});

test('auditGroundTruthCatalog covers required xref ids', async () => {
	const audit = await auditGroundTruthCatalog();
	expect(audit.ok).toBe(true);
	expect(audit.entryCount).toBe(GROUND_TRUTH_CATALOG.length);
	expect(audit.refCount).toBeGreaterThan(20);
	for (const id of GROUND_TRUTH_REQUIRED_XREF_IDS) {
		expect(GROUND_TRUTH_CATALOG.some(entry => entry.xrefId === id)).toBe(true);
	}
});

test('repo.bun and repo.effect xref entries exist', () => {
	expect(getCrossRef('repo.bun')?.docsUrl).toContain('github.com/oven-sh/bun');
	expect(getCrossRef('repo.effect')?.docsUrl).toContain('github.com/Effect-TS/effect');
	expect(getCrossRef('ground-truth.catalog')?.exports).toContain('planGroundTruthLoop');
});

test('formatRepoRefUrl builds github blob links', () => {
	const entry = GROUND_TRUTH_CATALOG.find(e => e.xrefId === 'workflow.loop')!;
	const url = formatRepoRefUrl(entry.refs[0]!);
	expect(url).toStartWith('https://github.com/oven-sh/bun/blob/main/');
});
