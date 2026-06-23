#!/usr/bin/env bun
import {bench, run} from '../runner.mjs';
import {
	auditBunCreateArtifactSpec,
	planArtifactSpecLoop,
	validateArtifactSpecCatalog,
	walkArtifactSpecLoop,
} from '../../src/utils/bun-create-catalog.ts';
import {
	auditDomainPackageInits,
	discoverDomainPackageInits,
	validateDomainPackageInits,
} from '../../src/domain/bun-init-catalog.ts';
import {auditDoctorLoops, executeLoopCli, executeLoopCliAsync} from '../../src/xref/loop-cli.ts';

const root = process.env.BENCH_ROOT ?? process.cwd();

bench('artifact-spec.walkLoop', () => {
	walkArtifactSpecLoop('domain.template', {includeStart: true, maxDepth: 2, bidirectional: true});
});

bench('artifact-spec.planLoop', () => {
	planArtifactSpecLoop('domain.template', {includeStart: true, maxDepth: 2, bidirectional: true});
});

bench('artifact-spec.validateCatalog', () => {
	validateArtifactSpecCatalog(undefined, root);
});

bench('artifact-spec.audit', () => {
	auditBunCreateArtifactSpec(root);
});

bench('domain-init.discoverPlans', async () => {
	await discoverDomainPackageInits(root);
});

bench('domain-init.validateAll', async () => {
	await validateDomainPackageInits(root);
});

bench('domain-init.audit', async () => {
	await auditDomainPackageInits(root);
});

bench('loop-cli.executeLoop', () => {
	executeLoopCli({
		id: 'domain.template',
		kind: 'artifact',
		maxDepth: 2,
		bidirectional: true,
		dryRun: true,
	});
});

bench('loop-cli.executeLoopAsync', async () => {
	await executeLoopCliAsync({
		id: '*',
		kind: 'domain-init',
		dryRun: true,
		root,
	});
});

bench('dd-loop.auditDoctorLoops', async () => {
	await auditDoctorLoops(root, {dryRun: true});
});

bench('ground-truth.collectSnapshot', async () => {
	const {collectGroundTruthSnapshot} = await import('../../src/utils/ground-truth-snapshot.ts');
	await collectGroundTruthSnapshot(root);
});

await run();
