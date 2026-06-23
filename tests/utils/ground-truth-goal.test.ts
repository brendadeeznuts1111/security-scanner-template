import {expect, test} from 'bun:test';
import {getCrossRef} from '../../src/xref/index.ts';
import {auditGroundTruthCatalog} from '../../src/utils/ground-truth-catalog.ts';
import {evaluateGroundTruthGoal} from '../../src/utils/ground-truth-goal.ts';

test('evaluateGroundTruthGoal passes for healthy catalog audit', async () => {
	const audit = await auditGroundTruthCatalog();
	const goal = evaluateGroundTruthGoal(audit);
	expect(goal.ok).toBe(true);
	expect(goal.targets.every(target => target.met)).toBe(true);
	expect(goal.summary).toContain('goal met');
});

test('evaluateGroundTruthGoal fails when required coverage is missing', () => {
	const goal = evaluateGroundTruthGoal({
		ok: false,
		entryCount: 1,
		refCount: 5,
		missingXrefCoverage: ['workflow.loop'],
		validation: {ok: true, findings: [], unknownXrefIds: []},
		localModules: {
			ok: true,
			missingModules: [],
			unlinkedModules: [],
			findings: [],
		},
	});
	expect(goal.ok).toBe(false);
	expect(goal.targets.find(target => target.id === 'required-coverage')?.met).toBe(false);
	expect(goal.targets.find(target => target.id === 'ref-depth')?.met).toBe(false);
});

test('goal targets align with live xref catalog', async () => {
	const audit = await auditGroundTruthCatalog();
	const goal = evaluateGroundTruthGoal(audit, {minRefCount: 1});
	expect(goal.targets.find(target => target.id === 'catalog-valid')?.met).toBe(audit.validation.ok);
	expect(getCrossRef('workflow.loop')).toBeDefined();
});
