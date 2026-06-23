/**
 * Shared loop planner for xref graph, bun-create artifact spec, and domain-init walks.
 * Doctor diagnostics (DD-Loop) audits canonical seeds via `auditDoctorLoops()`.
 */
import {
	discoverDomainPackageInits,
	validateDomainPackageInits,
	type DomainPackageInitPlan,
} from '../domain/bun-init-catalog.ts';
import {
	getArtifactSpecEntry,
	planArtifactSpecLoop,
	validateArtifactSpecCatalog,
	walkArtifactSpecLoop,
	type ArtifactSpecLoopStep,
} from '../utils/bun-create-catalog.ts';
import {
	auditGroundTruthLocalModules,
	getGroundTruthForXref,
	planGroundTruthLoop,
	validateGroundTruthLoopSteps,
} from '../utils/ground-truth-catalog.ts';
import {nanoseconds} from '../utils/nanoseconds.ts';
import {
	getCrossRef,
	planCrossRefLoop,
	validateCrossRefApis,
	walkCrossRefLoop,
	type CrossRefEntry,
	type CrossRefLoopStep,
} from './index.ts';

export type LoopKind = 'xref' | 'artifact' | 'domain-init' | 'ground-truth';

/** Canonical loop seeds audited by doctor diagnostics (DD-Loop). */
export const DOCTOR_LOOP_SEEDS = [
	{kind: 'xref', id: 'bun.init', label: 'domain package init graph'},
	{kind: 'xref', id: 'bun.create', label: 'artifact spec graph'},
	{kind: 'xref', id: 'workflow.loop', label: 'workflow scanner orchestrator graph'},
	{kind: 'xref', id: 'ground-truth.catalog', label: 'upstream repo reference graph'},
	{kind: 'ground-truth', id: 'workflow.loop', label: 'workflow upstream repo refs'},
	{kind: 'artifact', id: 'domain.template', label: 'golden template graph'},
	{kind: 'domain-init', id: '*', label: 'per-domain package inventory'},
] as const satisfies readonly {kind: LoopKind; id: string; label: string}[];

export type DoctorLoopSeed = (typeof DOCTOR_LOOP_SEEDS)[number];

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
	domainPlans?: readonly DomainPackageInitPlan[];
	count: number;
	dryRun: boolean;
	validation?: LoopCliValidation;
	benchmarkNs?: number;
	neighbours?: string[];
}

export interface DoctorLoopSeedResult {
	kind: LoopKind;
	startId: string;
	label: string;
	count: number;
	ok: boolean;
	dryRun: boolean;
	benchmarkNs?: number;
	findings: LoopValidationFinding[];
}

export interface DoctorLoopAudit {
	ok: boolean;
	seeds: DoctorLoopSeedResult[];
	totalNs: number;
}

function normalizeDepth(maxDepth?: number): number {
	if (maxDepth == null || !Number.isFinite(maxDepth)) {
		return Number.POSITIVE_INFINITY;
	}
	return maxDepth;
}

function toStepViews(
	steps: readonly CrossRefLoopStep[] | readonly ArtifactSpecLoopStep[],
): LoopStepView[] {
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

async function validateDomainInitLoopSteps(
	steps: readonly LoopStepView[],
	root: string,
): Promise<LoopCliValidation> {
	const validation = await validateDomainPackageInits(root);
	const findings: LoopValidationFinding[] = [];

	for (const step of steps) {
		if (step.id === '*') continue;
		const plan = validation.plans.find(entry => entry.domain === step.id);
		if (!plan) {
			findings.push({
				id: step.id,
				message: 'unknown domain package',
				severity: 'error',
			});
		}
	}

	for (const finding of validation.findings) {
		findings.push({
			id: finding.domain,
			message: finding.message,
			severity: finding.severity,
		});
	}

	const errors = findings.filter(finding => finding.severity === 'error');
	return {ok: errors.length === 0, findings};
}

async function planDomainInitLoop(startId: string, root: string): Promise<LoopStepView[]> {
	const plans = await discoverDomainPackageInits(root);
	if (startId === '*' || startId === 'all') {
		return plans.map(plan => ({id: plan.domain, depth: 0}));
	}

	const plan = plans.find(entry => entry.domain === startId);
	if (!plan) {
		return [{id: startId, depth: 0}];
	}

	return [
		{id: plan.domain, depth: 0},
		...plan.artifacts.map((artifact, index) => ({
			id: artifact.relativePath,
			depth: 1,
			via: index === 0 ? plan.domain : plan.artifacts[index - 1]?.relativePath,
		})),
	];
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

/** Plan and optionally validate a xref, artifact-spec, or domain-init loop. */
export function executeLoopCli(options: LoopCliOptions): LoopCliResult {
	const kind = options.kind ?? 'xref';
	const root = options.root ?? process.cwd();
	const loopOptions = {
		maxDepth: normalizeDepth(options.maxDepth),
		bidirectional: options.bidirectional ?? false,
		includeStart: options.includeStart ?? true,
	};

	const startNs = options.benchmark ? nanoseconds() : undefined;

	let steps: LoopStepView[];
	let entries: CrossRefEntry[] | undefined;
	let domainPlans: DomainPackageInitPlan[] | undefined;
	let neighbours: string[] | undefined;

	if (kind === 'domain-init') {
		throw new Error('executeLoopCli: use executeLoopCliAsync for domain-init kind');
	}

	if (kind === 'ground-truth') {
		const gtSteps = planGroundTruthLoop(options.id, {
			includeStart: loopOptions.includeStart,
		});
		steps = gtSteps.map(step => ({id: step.id, depth: step.depth, via: step.via}));
		if (!options.dryRun && !options.stepsOnly && !options.count) {
			const entry = getGroundTruthForXref(options.id);
			neighbours = entry?.refs.map(ref => `${ref.repo}:${ref.path}`);
		}
		let validation: LoopCliValidation | undefined;
		if (options.validate) {
			const gtValidation = validateGroundTruthLoopSteps(gtSteps);
			validation = {
				ok: gtValidation.ok,
				findings: gtValidation.findings.map(finding => ({
					id: finding.xrefId,
					message: finding.message,
					severity: finding.severity,
				})),
			};
		}
		const benchmarkNs =
			options.benchmark && startNs !== undefined ? nanoseconds() - startNs : undefined;
		return {
			kind,
			startId: options.id,
			steps,
			count: steps.length,
			dryRun: options.dryRun === true,
			validation,
			benchmarkNs,
			neighbours,
		};
	}

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
			kind === 'artifact' ? validateArtifactLoopSteps(steps, root) : validateXrefLoopSteps(steps);
	}

	const benchmarkNs =
		options.benchmark && startNs !== undefined ? nanoseconds() - startNs : undefined;

	return {
		kind,
		startId: options.id,
		steps,
		entries: options.dryRun ? undefined : entries,
		domainPlans,
		count: steps.length,
		dryRun: options.dryRun === true,
		validation,
		benchmarkNs,
		neighbours,
	};
}

/** Async loop executor — required for `domain-init` kind. */
export async function executeLoopCliAsync(options: LoopCliOptions): Promise<LoopCliResult> {
	const kind = options.kind ?? 'xref';
	if (kind === 'ground-truth' && options.validate) {
		const base = executeLoopCli(options);
		const localAudit = await auditGroundTruthLocalModules(options.root ?? process.cwd());
		const mergedFindings = [
			...(base.validation?.findings ?? []),
			...localAudit.findings.map(finding => ({
				id: finding.module,
				message: finding.message,
				severity: finding.severity,
			})),
		];
		const errors = mergedFindings.filter(finding => finding.severity === 'error');
		return {
			...base,
			validation: {ok: errors.length === 0, findings: mergedFindings},
		};
	}
	if (kind !== 'domain-init') {
		return executeLoopCli(options);
	}

	const root = options.root ?? process.cwd();
	const startNs = options.benchmark ? nanoseconds() : undefined;
	const steps = await planDomainInitLoop(options.id, root);
	const domainPlans = await discoverDomainPackageInits(root);

	let validation: LoopCliValidation | undefined;
	if (options.validate) {
		validation = await validateDomainInitLoopSteps(steps, root);
	}

	const benchmarkNs =
		options.benchmark && startNs !== undefined ? nanoseconds() - startNs : undefined;

	let neighbours: string[] | undefined;
	if (
		!options.dryRun &&
		!options.stepsOnly &&
		!options.count &&
		options.id !== '*' &&
		options.id !== 'all'
	) {
		const plan = domainPlans.find(entry => entry.domain === options.id);
		neighbours = plan?.artifacts.map(artifact => artifact.relativePath);
	}

	return {
		kind,
		startId: options.id,
		steps,
		domainPlans: options.dryRun ? undefined : domainPlans,
		count: steps.length,
		dryRun: options.dryRun === true,
		validation,
		benchmarkNs,
		neighbours,
	};
}

/** Run canonical DD-Loop seeds with validate + benchmark (doctor diagnostics). */
export async function auditDoctorLoops(
	root: string = process.cwd(),
	options: {
		dryRun?: boolean;
		maxDepth?: number;
		bidirectional?: boolean;
		seeds?: readonly DoctorLoopSeed[];
	} = {},
): Promise<DoctorLoopAudit> {
	const seeds = options.seeds ?? DOCTOR_LOOP_SEEDS;
	const totalStart = nanoseconds();
	const results: DoctorLoopSeedResult[] = [];

	for (const seed of seeds) {
		const result = await executeLoopCliAsync({
			id: seed.id,
			kind: seed.kind,
			maxDepth:
				options.maxDepth ??
				(seed.kind === 'domain-init' ? 0 : seed.kind === 'ground-truth' ? 1 : 2),
			bidirectional: options.bidirectional ?? seed.kind !== 'domain-init',
			validate: true,
			benchmark: true,
			dryRun: options.dryRun ?? false,
			root,
		});

		results.push({
			kind: seed.kind,
			startId: seed.id,
			label: seed.label,
			count: result.count,
			ok: result.validation?.ok ?? true,
			dryRun: result.dryRun,
			benchmarkNs: result.benchmarkNs,
			findings: result.validation?.findings ?? [],
		});
	}

	return {
		ok: results.every(entry => entry.ok),
		seeds: results,
		totalNs: nanoseconds() - totalStart,
	};
}

export function formatDoctorLoopTable(audit: DoctorLoopAudit): string {
	const lines = ['DD-Loop seeds:'];
	for (const seed of audit.seeds) {
		const status = seed.ok ? 'ok' : 'fail';
		const timing = seed.benchmarkNs != null ? ` ${seed.benchmarkNs}ns` : '';
		lines.push(
			`  ${seed.kind}:${seed.startId} — ${seed.count} step(s) ${status}${timing} (${seed.label})`,
		);
	}
	lines.push(`  total ${audit.totalNs}ns`);
	return lines.join('\n');
}

export function formatLoopCliJson(result: LoopCliResult): string {
	return JSON.stringify(result, null, 2);
}
