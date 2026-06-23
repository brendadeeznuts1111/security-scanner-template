import type {DoctorIssue} from '../config/doctor.ts';
import {
	applyConstraintFixes,
	formatPlannedInstall,
	formatPlannedRemoval,
	formatPlannedSourcePin,
	planConstraintImportFixes,
	planConstraintInstalls,
	planConstraintRemovals,
	planConstraintSourcePins,
} from './constraint-remediation.ts';
import type {SupplyChainDeepScanReport} from '../report/supply-chain-report.ts';
import {
	applyPlannedUpgrades,
	formatPlannedUpgrade,
	formatRemediationLine,
	planPackageUpgrades,
	type PlannedPackageUpgrade,
} from './semver-remediation.ts';

export type SupplyChainRemediationKind =
	| 'upgrade'
	| 'remove'
	| 'install'
	| 'pin-source'
	| 'import'
	| 'manual';

export interface SupplyChainRemediationAction {
	layer: 'packages' | 'constraints' | 'bundle';
	kind: SupplyChainRemediationKind;
	target: string;
	command?: string;
	autoFixable: boolean;
	message: string;
	ruleIds?: string[];
}

export interface SupplyChainRemediationPlan {
	queue: SupplyChainRemediationAction[];
	autoFixableCount: number;
	manualCount: number;
	upgrades: PlannedPackageUpgrade[];
}

const BUNDLE_REMEDIATION_HINTS: Record<string, string> = {
	'remote-import':
		'Replace dynamic import() with static paths or literal lazy routes, then rebuild the bundle.',
	'hardcoded-secret':
		'Move secrets to environment variables or Bun.secrets; rebuild after fixing source.',
	'unsafe-eval':
		'Remove eval() and Function constructor from source; rebuild the production bundle.',
	'function-constructor': 'Avoid new Function() in application source; rebuild after refactor.',
	'string-from-char-code':
		'Review obfuscated string construction in source — often benign in UI libs; verify intent.',
	'child-process': 'Avoid spawning shells from bundled code; gate behind server-only paths.',
};

function bundleHint(ruleId: string): string {
	return (
		BUNDLE_REMEDIATION_HINTS[ruleId] ??
		'Review transpiler finding in application source and rebuild the bundle.'
	);
}

/** Build an ordered remediation queue from a deep scan report. */
export function planSupplyChainRemediation(
	report: SupplyChainDeepScanReport,
): SupplyChainRemediationPlan {
	const queue: SupplyChainRemediationAction[] = [];

	if (report.packages?.violations.length) {
		const upgrades = planPackageUpgrades(report.packages.violations);
		for (const plan of upgrades) {
			queue.push({
				layer: 'packages',
				kind: 'upgrade',
				target: plan.package,
				command: `bun add ${plan.package}@${plan.toVersion}`,
				autoFixable: true,
				message: formatPlannedUpgrade(plan),
				ruleIds: plan.ruleIds,
			});
		}
		for (const violation of report.packages.violations) {
			if (violation.remediation?.suggestedVersion) continue;
			queue.push({
				layer: 'packages',
				kind: 'manual',
				target: violation.package,
				autoFixable: false,
				message: formatRemediationLine(violation, violation.remediation),
				ruleIds: violation.ruleId ? [violation.ruleId] : undefined,
			});
		}
	}

	const constraintViolations = [
		...(report.constraints?.violations ?? []),
		...(report.packages?.constraintViolations ?? []),
	];

	for (const plan of planConstraintRemovals(constraintViolations)) {
		queue.push({
			layer: 'constraints',
			kind: 'remove',
			target: plan.package,
			command: `bun remove ${plan.package}`,
			autoFixable: true,
			message: formatPlannedRemoval(plan),
			ruleIds: plan.ruleIds,
		});
	}
	for (const plan of planConstraintInstalls(constraintViolations)) {
		queue.push({
			layer: 'constraints',
			kind: 'install',
			target: plan.package,
			command: `bun add ${plan.package}@${plan.version}`,
			autoFixable: true,
			message: formatPlannedInstall(plan),
			ruleIds: plan.ruleIds,
		});
	}
	for (const plan of planConstraintSourcePins(constraintViolations)) {
		queue.push({
			layer: 'constraints',
			kind: 'pin-source',
			target: plan.package,
			command: `bun add ${plan.package}`,
			autoFixable: true,
			message: formatPlannedSourcePin(plan),
			ruleIds: plan.ruleIds,
		});
	}
	for (const violation of planConstraintImportFixes(constraintViolations)) {
		queue.push({
			layer: 'constraints',
			kind: 'import',
			target: `${violation.file}:${violation.line}`,
			autoFixable: true,
			message: `remove blocked import ${violation.file}:${violation.line}`,
			ruleIds: violation.ruleId ? [violation.ruleId] : undefined,
		});
	}

	for (const finding of report.bundle.findings) {
		queue.push({
			layer: 'bundle',
			kind: 'manual',
			target: finding.file,
			autoFixable: false,
			message: `${finding.ruleId} ${finding.file}:${finding.line ?? '?'} — ${bundleHint(finding.ruleId)}`,
			ruleIds: [finding.ruleId],
		});
	}

	const autoFixableCount = queue.filter(action => action.autoFixable).length;
	return {
		queue,
		autoFixableCount,
		manualCount: queue.length - autoFixableCount,
		upgrades: planPackageUpgrades(report.packages?.violations ?? []),
	};
}

export interface SupplyChainRemediationApplyResult {
	ok: boolean;
	results: {action: string; target: string; ok: boolean; message: string}[];
}

/** Apply auto-fixable items from a remediation plan (package + constraint layers). */
export async function applySupplyChainRemediationPlan(
	root: string,
	report: SupplyChainDeepScanReport,
	plan: SupplyChainRemediationPlan,
): Promise<SupplyChainRemediationApplyResult> {
	const results: SupplyChainRemediationApplyResult['results'] = [];

	if (plan.upgrades.length > 0) {
		const applied = await applyPlannedUpgrades(root, plan.upgrades);
		for (const entry of applied.results) {
			results.push({
				action: 'upgrade',
				target: entry.package,
				ok: entry.ok,
				message: entry.message,
			});
		}
	}

	const constraintViolations = [
		...(report.constraints?.violations ?? []),
		...(report.packages?.constraintViolations ?? []),
	];
	if (constraintViolations.length > 0) {
		const applied = await applyConstraintFixes(root, constraintViolations);
		for (const entry of applied.results) {
			results.push({
				action: entry.action,
				target: entry.target,
				ok: entry.ok,
				message: entry.message,
			});
		}
	}

	return {
		ok: results.length > 0 && results.every(entry => entry.ok),
		results,
	};
}

function mapTranspilerSeverity(severity: string): {
	doctorSeverity: DoctorIssue['severity'];
	code: string;
} {
	if (severity === 'critical' || severity === 'high') {
		return {doctorSeverity: 'error', code: 'SUPPLY_CHAIN_FATAL'};
	}
	return {doctorSeverity: 'warning', code: 'SUPPLY_CHAIN_WARN'};
}

function mapSemverSeverity(severity: string): {
	doctorSeverity: DoctorIssue['severity'];
	code: string;
} {
	if (severity === 'critical' || severity === 'high') {
		return {doctorSeverity: 'error', code: 'SUPPLY_CHAIN_FATAL'};
	}
	return {doctorSeverity: 'warning', code: 'SUPPLY_CHAIN_WARN'};
}

/** Map deep scan findings to doctor issues for operator.jsonl emission. */
export function supplyChainReportToDoctorIssues(report: SupplyChainDeepScanReport): DoctorIssue[] {
	const domain = report.identity.domain ?? 'supply-chain';
	const root = report.projectRoot ?? report.bundlePath;
	const issues: DoctorIssue[] = [];

	for (const finding of report.bundle.findings) {
		const mapped = mapTranspilerSeverity(finding.severity);
		issues.push({
			domain,
			path: finding.file,
			field: 'bundle.transpiler',
			message: `${finding.ruleId}: ${finding.message}`,
			severity: mapped.doctorSeverity,
			code: mapped.code,
			scope: 'core',
			coreSegment: 'supply-chain',
			location: `bundle.${finding.ruleId}`,
			channel: 'supplyChain',
		});
	}

	for (const violation of report.packages?.violations ?? []) {
		const mapped = mapSemverSeverity(violation.severity);
		issues.push({
			domain,
			path: root,
			field: 'packages.semver',
			message: `${violation.package}@${violation.version}: ${violation.message}`,
			severity: mapped.doctorSeverity,
			code: mapped.code,
			scope: 'core',
			coreSegment: 'supply-chain',
			location: violation.ruleId ?? 'policy.semver',
			channel: 'supplyChain',
		});
	}

	for (const violation of [
		...(report.constraints?.violations ?? []),
		...(report.packages?.constraintViolations ?? []),
	]) {
		const mapped = mapSemverSeverity(violation.severity);
		issues.push({
			domain,
			path: violation.file ?? root,
			field: 'policy.constraints',
			message: violation.message,
			severity: mapped.doctorSeverity,
			code: violation.source.startsWith('policy-constraint-license')
				? 'POLICY_CONSTRAINT_LICENSE'
				: 'POLICY_CONSTRAINT',
			scope: 'core',
			coreSegment: 'supply-chain',
			location: violation.ruleId ?? violation.source,
			channel: 'supplyChain',
		});
	}

	return issues;
}

export function formatRemediationQueueMarkdown(plan: SupplyChainRemediationPlan): string {
	if (plan.queue.length === 0) {
		return '_No remediation actions planned._';
	}
	const lines = [
		'## Remediation queue',
		'',
		`| Auto-fixable | ${plan.autoFixableCount} |`,
		`| Manual | ${plan.manualCount} |`,
		'',
	];
	for (const action of plan.queue) {
		const tag = action.autoFixable ? 'auto' : 'manual';
		lines.push(`- **[${tag}/${action.layer}]** ${action.message}`);
		if (action.command) {
			lines.push(`  - \`${action.command}\``);
		}
	}
	return lines.join('\n');
}
