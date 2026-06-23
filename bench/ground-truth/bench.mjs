#!/usr/bin/env bun
import {bench, run} from '../runner.mjs';
import {
	auditGroundTruthCatalog,
	auditGroundTruthLocalModules,
	planGroundTruthLoop,
	validateGroundTruthCatalog,
} from '../../src/utils/ground-truth-catalog.ts';
import {evaluateGroundTruthGoal} from '../../src/utils/ground-truth-goal.ts';
import {
	buildGroundTruthSnapshot,
	collectGroundTruthSnapshot,
	compareGroundTruthSnapshots,
} from '../../src/utils/ground-truth-snapshot.ts';
import {executeLoopCliAsync} from '../../src/xref/loop-cli.ts';
import {getCrossRef} from '../../src/xref/index.ts';

const root = process.env.BENCH_ROOT ?? process.cwd();

bench('ground-truth.validateCatalog', () => {
	validateGroundTruthCatalog(id => getCrossRef(id) !== undefined);
});

bench('ground-truth.planLoop', () => {
	planGroundTruthLoop('workflow.loop', {includeStart: true});
});

bench('ground-truth.auditCatalog', async () => {
	await auditGroundTruthCatalog(root);
});

bench('ground-truth.auditLocalModules', async () => {
	await auditGroundTruthLocalModules(root);
});

bench('ground-truth.evaluateGoal', async () => {
	const audit = await auditGroundTruthCatalog(root);
	evaluateGroundTruthGoal(audit);
});

bench('ground-truth.buildSnapshot', async () => {
	const {audit, goal} = await collectGroundTruthSnapshot(root);
	buildGroundTruthSnapshot(audit, goal);
});

bench('ground-truth.compareSnapshot', async () => {
	const {snapshot} = await collectGroundTruthSnapshot(root);
	compareGroundTruthSnapshots(snapshot, snapshot);
});

bench('ground-truth.loopCli', async () => {
	await executeLoopCliAsync({
		id: 'workflow.loop',
		kind: 'ground-truth',
		validate: true,
		root,
	});
});

await run();
