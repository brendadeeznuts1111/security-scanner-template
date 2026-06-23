/**
 * Ground-truth catalog conformance — xref linkage, repo URLs, workflow scanners, module headers.
 * @see https://github.com/oven-sh/bun
 * @see https://github.com/Effect-TS/effect
 */
import path from 'path';
import {expect, test} from 'bun:test';
import {getCrossRef} from '../../../src/xref/index.ts';
import {executeLoopCliAsync} from '../../../src/xref/loop-cli.ts';
import {
	auditGroundTruthCatalog,
	auditGroundTruthLocalModules,
	extractGithubSeeRefs,
	formatRepoRefUrl,
	getGroundTruthForWorkflowScanner,
	GROUND_TRUTH_CATALOG,
	GROUND_TRUTH_REPO_INDEX_URLS,
	GROUND_TRUTH_REQUIRED_XREF_IDS,
	moduleLinksGroundTruth,
	planGroundTruthLoop,
	WORKFLOW_SCANNER_GROUND_TRUTH,
} from '../../../src/utils/ground-truth-catalog.ts';

const ROOT = path.join(import.meta.dir, '../../..');

test('GROUND_TRUTH_CATALOG entries have unique xref ids and valid repo URLs', () => {
	const ids = GROUND_TRUTH_CATALOG.map(entry => entry.xrefId);
	expect(new Set(ids).size).toBe(ids.length);
	for (const entry of GROUND_TRUTH_CATALOG) {
		expect(entry.refs.length).toBeGreaterThan(0);
		for (const ref of entry.refs) {
			const url = formatRepoRefUrl(ref);
			expect(url).toStartWith('https://github.com/');
			expect(url).toContain(ref.path);
		}
	}
});

test('WORKFLOW_SCANNER_GROUND_TRUTH maps every scanner to grounded xref', () => {
	for (const [scannerId, xrefId] of Object.entries(WORKFLOW_SCANNER_GROUND_TRUTH)) {
		expect(getGroundTruthForWorkflowScanner(scannerId)?.xrefId).toBe(xrefId);
		expect(getCrossRef(xrefId)).toBeDefined();
	}
});

test('planGroundTruthLoop walks workflow.loop xref to bun and effect refs', () => {
	const steps = planGroundTruthLoop('workflow.loop', {includeStart: true});
	expect(steps.some(step => step.id === 'workflow.loop' && step.kind === 'xref')).toBe(true);
	expect(steps.some(step => step.kind === 'repo-ref' && step.id.includes('oven-sh/bun'))).toBe(
		false,
	);
	expect(steps.some(step => step.kind === 'repo-ref' && step.id.startsWith('bun:'))).toBe(true);
	expect(steps.some(step => step.kind === 'repo-ref' && step.id.startsWith('effect:'))).toBe(true);
	expect(steps.some(step => step.kind === 'local-module')).toBe(true);
});

test('executeLoopCliAsync ground-truth kind validates workflow.loop', async () => {
	const result = await executeLoopCliAsync({
		id: 'workflow.loop',
		kind: 'ground-truth',
		validate: true,
		root: ROOT,
	});
	expect(result.kind).toBe('ground-truth');
	expect(result.count).toBeGreaterThan(3);
	expect(result.validation?.ok).toBe(true);
});

test('auditGroundTruthCatalog passes for full project tree', async () => {
	const audit = await auditGroundTruthCatalog(ROOT);
	expect(audit.ok).toBe(true);
	expect(audit.localModules.missingModules).toEqual([]);
	for (const id of GROUND_TRUTH_REQUIRED_XREF_IDS) {
		expect(GROUND_TRUTH_CATALOG.some(entry => entry.xrefId === id)).toBe(true);
	}
});

test('required workflow modules cite github ground truth', async () => {
	const audit = await auditGroundTruthLocalModules(ROOT);
	const workflowUnlinked = audit.unlinkedModules.filter(
		finding => finding.xrefId === 'workflow.loop',
	);
	expect(workflowUnlinked).toEqual([]);
});

test('extractGithubSeeRefs parses module header links', () => {
	const sample = `/**
 * @see https://github.com/oven-sh/bun/blob/main/docs/runtime/watch.mdx
 * @see https://github.com/Effect-TS/effect/blob/main/packages/effect/src/Schedule.ts
 */`;
	const refs = extractGithubSeeRefs(sample);
	expect(refs.length).toBe(2);
	const entry = GROUND_TRUTH_CATALOG.find(e => e.xrefId === 'workflow.loop')!;
	expect(moduleLinksGroundTruth(sample, entry)).toBe(true);
});

test('repo index URLs point at bun utils and effect README', () => {
	expect(GROUND_TRUTH_REPO_INDEX_URLS.bun).toContain('oven-sh/bun');
	expect(GROUND_TRUTH_REPO_INDEX_URLS.bun).toContain('utils.mdx');
	expect(GROUND_TRUTH_REPO_INDEX_URLS.effect).toContain('Effect-TS/effect');
});
