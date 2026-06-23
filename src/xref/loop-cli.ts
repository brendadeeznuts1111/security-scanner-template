/**
 * Shared loop planner for xref graph and bun-create artifact spec walks.
 */
import path from 'path';
import {
	getArtifactSpecEntry,
	planArtifactSpecLoop,
	validateArtifactSpecCatalog,
	walkArtifactSpecLoop,
	type ArtifactSpecLoopStep,
} from '../utils/bun-create-catalog.ts';
import {nanoseconds} from '../utils/nanoseconds.ts';
import {
	getCrossRef,
	planCrossRefLoop,
	validateCrossRefApis,
	walkCrossRefLoop,
	type CrossRefEntry,
	type CrossRefLoopStep,
} from './index.ts';

export type LoopKind = 'xref' | 'artifact';

export interface LoopCliOptions {
	id: string;
	kind?: LoopKind;
	maxDepth?: number;
	bidirectional?: boolean;
	includeStart?: boolean;
	dryRun?: boolean;
	stepsOnly?: boolean;
	validate?: boolean;
	benchmark?: boolean;
	quiet?: boolean;
	count?: boolean;
	json?: boolean;
	root?: string;
}

export interface LoopStepView {
	id: string;
	depth: number;
	via?: string;
}

export interface LoopValidationFinding {
	id: string;
	message: string;
	severity: 'error' | 'warning';
}

export interface LoopCliValidation {
	ok: boolean;
	findings: LoopValidationFinding[];
}

export interface LoopCliResult {
	kind: LoopKind;
	startId: string;
	steps: LoopStepView[];
	entries?: CrossRefEntry[];
	count: number;
	dryRun: boolean;
	validation?: LoopCliValidation;
	benchmarkNs?: number;
	neighbours?: string[];
}

function normalizeDepth(maxDepth?: number): number {
	if (maxDepth == null || !Number.isFinite(maxDepth)) {
		return Number.POSITIVE_INFINITY;
	}
	return maxDepth;
}

function toStepViews(steps: readonly CrossRefLoopStep[] | readonly ArtifactSpecLoopStep[]): LoopStepView[] {
	return steps.map(step => ({id: step.id, depth: step.depth, via: step.via}));
}

function validateXrefLoopSteps(steps: readonly LoopStepView[]): LoopCliValidation {
	const apiValidation = validateCrossRefApis();
	const findings: LoopValidationFinding[] = [];

	for (const step of steps) {
		const entry = getCrossRef(step.id);
		if (!entry) {
			findings.push({
				id: step.id,
				message: 'unknown cross-ref id',
				severity: 'error',
			});
			continue;
		}

		const status = apiValidation.entries.find(item => item.id === step.id);
		if (entry.required && status && !status.available) {
			findings.push({
				id: step.id,
				message: `required API unavailable (${entry.bunApi ?? entry.id})`,
				severity: 'error',
			});
		}
		if (entry.feature && status && !status.featureEnabled) {
			findings.push({
				id: step.id,
				message: `feature gate disabled (${entry.feature})`,
				severity: 'warning',
			});
		}
	}

	const errors = findings.filter(finding => finding.severity === 'error');
	return {ok: errors.length === 0, findings};
}

function validateArtifactLoopSteps(
	steps: readonly LoopStepView[],
	root: string,
): LoopCliValidation {
	const catalog = validateArtifactSpecCatalog(undefined, root);
	const findings: LoopValidationFinding[] = [];

	for (const step of steps) {
		const entry = getArtifactSpecEntry(step.id);
		if (!entry) {
			findings.push({
				id: step.id,
				message: 'unknown artifact spec id',
				severity: 'error',
			});
			continue;
		}

		const missing = catalog.missingArtifacts.find(item => item.id === step.id);
		if (missing) {
			findings.push({
				id: step.id,
				message: `missing artifact "${missing.path}"`,
				severity: 'error',
			});
		}
	}

	const errors = findings.filter(finding => finding.severity === 'error');
	return {ok: errors.length === 0, findings};
}

/** Plan and optionally validate a xref or artifact-spec loop. */
export function executeLoopCli(options: LoopCliOptions): LoopCliResult {
	const kind = options.kind ?? 'xref';
	const loopOptions = {
		maxDepth: normalizeDepth(options.maxDepth),
		bidirectional: options.bidirectional ?? false,
		includeStart: options.includeStart ?? true,
	};

	const startNs = options.benchmark ? nanoseconds() : undefined;

	let steps: LoopStepView[];
	let entries: CrossRefEntry[] | undefined;
	let neighbours: string[] | undefined;

	if (kind === 'artifact') {
		const rawSteps = planArtifactSpecLoop(options.id, loopOptions);
		steps = toStepViews(rawSteps);
		if (!options.dryRun && !options.stepsOnly && !options.count) {
			const startEntry = getArtifactSpecEntry(options.id);
			neighbours = startEntry?.related ? [...startEntry.related] : [];
		}
	} else {
		const rawSteps = planCrossRefLoop(options.id, loopOptions);
		steps = toStepViews(rawSteps);
		if (!options.dryRun) {
			entries = walkCrossRefLoop(options.id, loopOptions);
		}
		if (!options.dryRun && !options.stepsOnly && !options.count) {
			const startEntry = getCrossRef(options.id);
			neighbours = startEntry?.related ? [...startEntry.related] : [];
		}
	}

	let validation: LoopCliValidation | undefined;
	if (options.validate) {
		validation =
			kind === 'artifact'
				? validateArtifactLoopSteps(steps, options.root ?? process.cwd())
				: validateXrefLoopSteps(steps);
	}

	const benchmarkNs =
		options.benchmark && startNs !== undefined ? nanoseconds() - startNs : undefined;

	return {
		kind,
		startId: options.id,
		steps,
		entries: options.dryRun ? undefined : entries,
		count: steps.length,
		dryRun: options.dryRun === true,
		validation,
		benchmarkNs,
		neighbours,
	};
}

export function formatLoopCliJson(result: LoopCliResult): string {
	return JSON.stringify(result, null, 2);
}