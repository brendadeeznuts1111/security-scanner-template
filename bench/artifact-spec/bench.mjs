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

await run();