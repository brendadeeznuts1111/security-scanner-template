/**
 * bun create / template artifact spec catalog with graph walk + validation.
 * @see https://bun.com/docs/runtime/templating/create
 * @see https://bun.com/docs/runtime/templating/init
 */
import {existsSync} from 'fs';
import path from 'path';

export const BUN_CREATE_DOCS_URL = 'https://bun.com/docs/runtime/templating/create';
export const BUN_INIT_DOCS_URL = 'https://bun.com/docs/runtime/templating/init';

export type ArtifactSpecKind = 'json5' | 'toml' | 'json' | 'package';

export interface BunCreateArtifactEntry {
	id: string;
	/** Repo-relative path to the template or scaffold artifact. */
	path: string;
	kind: ArtifactSpecKind;
	description: string;
	related?: readonly string[];
	docsUrl: string;
	/** Test modules that exercise conformance for this artifact. */
	testModules?: readonly string[];
}

export interface ArtifactSpecLoopOptions {
	maxDepth?: number;
	bidirectional?: boolean;
	includeStart?: boolean;
}

export interface ArtifactSpecLoopStep {
	id: string;
	depth: number;
	via?: string;
}

export interface ArtifactSpecCatalogFinding {
	kind: 'unknown-related' | 'missing-artifact' | 'missing-test';
	id: string;
	message: string;
	severity: 'error' | 'warning';
}

export interface ArtifactSpecCatalogValidation {
	ok: boolean;
	findings: ArtifactSpecCatalogFinding[];
	unknownRelated: {from: string; to: string}[];
	missingArtifacts: {id: string; path: string}[];
	missingTests: {id: string; module: string}[];
}

export interface BunCreateArtifactAudit {
	ok: boolean;
	entries: readonly BunCreateArtifactEntry[];
	missing: string[];
	catalog: ArtifactSpecCatalogValidation;
}

const TEST_FIELD_MATRIX = 'tests/domain/field-matrix.test.ts';
const TEST_BUN_INIT = 'tests/domain/bun-init-catalog.test.ts';
const TEST_BUN_CREATE = 'tests/utils/bun-create-catalog.test.ts';

export const BUN_CREATE_ARTIFACT_SPEC: readonly BunCreateArtifactEntry[] = [
	{
		id: 'domain.template',
		path: 'templates/domain.template.json5',
		kind: 'json5',
		description: 'Golden domain security config — copy to domains/<domain>.security.json5',
		related: ['network-baseline.template', 'security.policy', 'transpiler-rules'],
		docsUrl: BUN_INIT_DOCS_URL,
		testModules: [TEST_FIELD_MATRIX, TEST_BUN_INIT],
	},
	{
		id: 'network-baseline.template',
		path: 'templates/network-baseline.template.json5',
		kind: 'json5',
		description: 'Per-domain network audit baseline golden template',
		related: ['domain.template'],
		docsUrl: BUN_INIT_DOCS_URL,
		testModules: [TEST_BUN_CREATE],
	},
	{
		id: 'security.policy',
		path: 'templates/security.policy.toml',
		kind: 'toml',
		description: 'Supply-chain policy template (fatal/warn categories, allowed drift)',
		related: ['domain.template', 'transpiler-rules'],
		docsUrl: BUN_CREATE_DOCS_URL,
		testModules: [TEST_BUN_CREATE],
	},
	{
		id: 'transpiler-rules',
		path: 'templates/transpiler-rules.toml',
		kind: 'toml',
		description: 'Bun.Transpiler bundle scan rule definitions',
		related: ['security.policy', 'domain.template'],
		docsUrl: BUN_CREATE_DOCS_URL,
		testModules: [TEST_BUN_CREATE],
	},
] as const;

const PROJECT_ROOT = path.join(import.meta.dir, '..', '..');

export function artifactSpecIds(): string[] {
	return BUN_CREATE_ARTIFACT_SPEC.map(entry => entry.id);
}

export function getArtifactSpecEntry(id: string): BunCreateArtifactEntry | undefined {
	return BUN_CREATE_ARTIFACT_SPEC.find(entry => entry.id === id);
}

function getArtifactSpecNeighbourIds(
	id: string,
	options: {bidirectional?: boolean} = {},
): string[] {
	const entry = getArtifactSpecEntry(id);
	if (!entry) return [];
	const neighbours = new Set(entry.related ?? []);
	if (options.bidirectional) {
		for (const candidate of BUN_CREATE_ARTIFACT_SPEC) {
			if (candidate.related?.includes(id)) {
				neighbours.add(candidate.id);
			}
		}
	}
	return [...neighbours];
}

/** Breadth-first walk across the artifact spec graph. */
export function walkArtifactSpecLoop(
	startId: string,
	options: ArtifactSpecLoopOptions = {},
): BunCreateArtifactEntry[] {
	const {maxDepth = Number.POSITIVE_INFINITY, bidirectional = false, includeStart = false} =
		options;
	const start = getArtifactSpecEntry(startId);
	if (!start) return [];

	const visited = new Set<string>();
	const ordered: BunCreateArtifactEntry[] = [];
	const queue: ArtifactSpecLoopStep[] = [{id: startId, depth: 0}];

	while (queue.length > 0) {
		const step = queue.shift()!;
		if (visited.has(step.id)) continue;
		visited.add(step.id);

		const entry = getArtifactSpecEntry(step.id);
		if (!entry) continue;

		if (includeStart || step.id !== startId) {
			ordered.push(entry);
		}
		if (step.depth >= maxDepth) continue;

		for (const nextId of getArtifactSpecNeighbourIds(step.id, {bidirectional})) {
			if (!visited.has(nextId)) {
				queue.push({id: nextId, depth: step.depth + 1, via: step.id});
			}
		}
	}

	return ordered;
}

/** Ordered loop steps for CLI / diagnostics output. */
export function planArtifactSpecLoop(
	startId: string,
	options: ArtifactSpecLoopOptions = {},
): ArtifactSpecLoopStep[] {
	const {maxDepth = Number.POSITIVE_INFINITY, bidirectional = false, includeStart = true} =
		options;
	const start = getArtifactSpecEntry(startId);
	if (!start) return [];

	const visited = new Set<string>();
	const steps: ArtifactSpecLoopStep[] = [];
	const queue: ArtifactSpecLoopStep[] = [{id: startId, depth: 0}];

	while (queue.length > 0) {
		const step = queue.shift()!;
		if (visited.has(step.id)) continue;
		visited.add(step.id);

		if (getArtifactSpecEntry(step.id)) {
			if (includeStart || step.id !== startId) {
				steps.push(step);
			}
		}
		if (step.depth >= maxDepth) continue;

		for (const nextId of getArtifactSpecNeighbourIds(step.id, {bidirectional})) {
			if (!visited.has(nextId)) {
				queue.push({id: nextId, depth: step.depth + 1, via: step.id});
			}
		}
	}

	return steps;
}

/** Validate artifact paths, related ids, and declared test modules. */
export function validateArtifactSpecCatalog(
	catalog: readonly BunCreateArtifactEntry[] = BUN_CREATE_ARTIFACT_SPEC,
	projectRoot: string = PROJECT_ROOT,
): ArtifactSpecCatalogValidation {
	const ids = new Set(catalog.map(entry => entry.id));
	const findings: ArtifactSpecCatalogFinding[] = [];
	const unknownRelated: {from: string; to: string}[] = [];
	const missingArtifacts: {id: string; path: string}[] = [];
	const missingTests: {id: string; module: string}[] = [];

	for (const entry of catalog) {
		for (const relatedId of entry.related ?? []) {
			if (!ids.has(relatedId)) {
				unknownRelated.push({from: entry.id, to: relatedId});
				findings.push({
					kind: 'unknown-related',
					id: entry.id,
					message: `unknown related id "${relatedId}"`,
					severity: 'error',
				});
			}
		}

		const fullPath = path.join(projectRoot, entry.path);
		if (!existsSync(fullPath)) {
			missingArtifacts.push({id: entry.id, path: entry.path});
			findings.push({
				kind: 'missing-artifact',
				id: entry.id,
				message: `missing artifact "${entry.path}"`,
				severity: 'error',
			});
		}

		for (const testModule of entry.testModules ?? []) {
			const testPath = path.join(projectRoot, testModule);
			if (!existsSync(testPath)) {
				missingTests.push({id: entry.id, module: testModule});
				findings.push({
					kind: 'missing-test',
					id: entry.id,
					message: `missing test module "${testModule}"`,
					severity: 'warning',
				});
			}
		}
	}

	const errors = findings.filter(finding => finding.severity === 'error');
	return {
		ok: errors.length === 0,
		findings,
		unknownRelated,
		missingArtifacts,
		missingTests,
	};
}

/** Audit bun-create artifact spec conformance for doctor / xref. */
export function auditBunCreateArtifactSpec(
	projectRoot: string = PROJECT_ROOT,
): BunCreateArtifactAudit {
	const catalog = validateArtifactSpecCatalog(BUN_CREATE_ARTIFACT_SPEC, projectRoot);
	const missing = catalog.missingArtifacts.map(item => item.path);
	return {
		ok: catalog.ok,
		entries: BUN_CREATE_ARTIFACT_SPEC,
		missing,
		catalog,
	};
}

export function isBunCreateArtifactSpecAvailable(): boolean {
	return typeof Bun !== 'undefined';
}