import {expect, test} from 'bun:test';
import {
	artifactSpecIds,
	auditBunCreateArtifactSpec,
	BUN_CREATE_ARTIFACT_SPEC,
	BUN_CREATE_DOCS_URL,
	BUN_INIT_DOCS_URL,
	getArtifactSpecEntry,
	planArtifactSpecLoop,
	validateArtifactSpecCatalog,
	walkArtifactSpecLoop,
} from '../../../src/utils/bun-create-catalog.ts';

test('artifact spec has unique ids and template paths', () => {
	const ids = artifactSpecIds();
	expect(new Set(ids).size).toBe(ids.length);
	for (const entry of BUN_CREATE_ARTIFACT_SPEC) {
		const pathPrefix = entry.kind === 'package' ? 'src/' : 'templates/';
		expect(entry.path.startsWith(pathPrefix)).toBe(true);
		expect(entry.docsUrl.startsWith('https://')).toBe(true);
	}
});

test('walkArtifactSpecLoop traverses related templates from domain.template', () => {
	const walked = walkArtifactSpecLoop('domain.template', {includeStart: true, maxDepth: 1});
	const walkedIds = walked.map(entry => entry.id);
	expect(walkedIds).toContain('domain.template');
	expect(walkedIds).toContain('network-baseline.template');
	expect(walkedIds).toContain('security.policy');
});

test('planArtifactSpecLoop returns depth steps with via backlinks when bidirectional', () => {
	const steps = planArtifactSpecLoop('network-baseline.template', {
		bidirectional: true,
		maxDepth: 2,
	});
	expect(steps[0]?.id).toBe('network-baseline.template');
	expect(steps.some(step => step.id === 'domain.template')).toBe(true);
});

test('validateArtifactSpecCatalog passes for repo templates', () => {
	const result = validateArtifactSpecCatalog();
	expect(result.ok).toBe(true);
	expect(result.missingArtifacts).toEqual([]);
	expect(result.unknownRelated).toEqual([]);
});

test('auditBunCreateArtifactSpec reports conformance', () => {
	const audit = auditBunCreateArtifactSpec();
	expect(audit.ok).toBe(true);
	expect(audit.missing).toEqual([]);
	expect(audit.entries.length).toBe(BUN_CREATE_ARTIFACT_SPEC.length);
});

test('docs urls align with Bun templating guides', () => {
	expect(BUN_CREATE_DOCS_URL).toBe('https://bun.com/docs/runtime/templating/create');
	expect(BUN_INIT_DOCS_URL).toBe('https://bun.com/docs/runtime/templating/init');
	expect(getArtifactSpecEntry('domain.template')?.docsUrl).toBe(BUN_INIT_DOCS_URL);
});
