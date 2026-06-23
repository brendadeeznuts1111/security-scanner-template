/**
 * Ground-truth goal checklist — CI gates for upstream repo reference health.
 */
import type {GroundTruthCatalogAudit} from './ground-truth-catalog.ts';

export interface GroundTruthGoalTarget {
	id: string;
	label: string;
	met: boolean;
	detail?: string;
}

export interface GroundTruthGoalResult {
	ok: boolean;
	targets: GroundTruthGoalTarget[];
	summary: string;
}

export interface GroundTruthGoalOptions {
	/** Minimum upstream ref count (default: 20). */
	minRefCount?: number;
	/** Fail when modules lack @see github links. */
	requireLinkedModules?: boolean;
}

export function evaluateGroundTruthGoal(
	audit: GroundTruthCatalogAudit,
	options: GroundTruthGoalOptions = {},
): GroundTruthGoalResult {
	const minRefCount = options.minRefCount ?? 20;
	const requireLinked = options.requireLinkedModules ?? true;

	const targets: GroundTruthGoalTarget[] = [
		{
			id: 'catalog-valid',
			label: 'xref catalog links resolve',
			met: audit.validation.ok,
			detail: audit.validation.ok
				? undefined
				: `${audit.validation.findings.filter(f => f.severity === 'error').length} error(s)`,
		},
		{
			id: 'required-coverage',
			label: 'required xref ids covered',
			met: audit.missingXrefCoverage.length === 0,
			detail:
				audit.missingXrefCoverage.length > 0
					? `missing: ${audit.missingXrefCoverage.join(', ')}`
					: undefined,
		},
		{
			id: 'local-modules',
			label: 'local src modules exist',
			met: audit.localModules.missingModules.length === 0,
			detail:
				audit.localModules.missingModules.length > 0
					? `${audit.localModules.missingModules.length} missing`
					: undefined,
		},
		{
			id: 'module-headers',
			label: 'modules cite github ground truth',
			met: requireLinked ? audit.localModules.unlinkedModules.length === 0 : true,
			detail:
				requireLinked && audit.localModules.unlinkedModules.length > 0
					? `${audit.localModules.unlinkedModules.length} unlinked`
					: undefined,
		},
		{
			id: 'ref-depth',
			label: `upstream refs ≥ ${minRefCount}`,
			met: audit.refCount >= minRefCount,
			detail: `${audit.refCount} refs`,
		},
	];

	const ok = targets.every(target => target.met);
	const failed = targets.filter(target => !target.met).map(target => target.id);
	return {
		ok,
		targets,
		summary: ok
			? `ground-truth goal met (${audit.entryCount} xrefs, ${audit.refCount} refs)`
			: `ground-truth goal blocked: ${failed.join(', ')}`,
	};
}
