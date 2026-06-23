import path from 'path';
import {runBunPm} from '../utils/install-runtime.ts';
import type {ConstraintViolation} from './constraint-types.ts';

export interface PlannedPackageRemoval {
	package: string;
	version?: string;
	sources: ConstraintViolation['source'][];
	ruleIds: string[];
}

export interface PlannedPackageInstall {
	package: string;
	version: string;
	sources: ConstraintViolation['source'][];
	ruleIds: string[];
}

const REMOVABLE_SOURCES = new Set<ConstraintViolation['source']>([
	'policy-constraint-block',
	'policy-constraint-allow',
	'policy-constraint-license',
]);

/** Collapse removable constraint violations to one `bun remove` per package. */
export function planConstraintRemovals(
	violations: readonly ConstraintViolation[],
): PlannedPackageRemoval[] {
	const planned = new Map<string, PlannedPackageRemoval>();

	for (const violation of violations) {
		if (!violation.package || !REMOVABLE_SOURCES.has(violation.source)) continue;

		const existing = planned.get(violation.package);
		if (!existing) {
			planned.set(violation.package, {
				package: violation.package,
				version: violation.version,
				sources: [violation.source],
				ruleIds: violation.ruleId ? [violation.ruleId] : [],
			});
			continue;
		}

		if (!existing.sources.includes(violation.source)) {
			existing.sources.push(violation.source);
		}
		if (violation.ruleId && !existing.ruleIds.includes(violation.ruleId)) {
			existing.ruleIds.push(violation.ruleId);
		}
	}

	return [...planned.values()].sort((a, b) => a.package.localeCompare(b.package));
}

/** Plan `bun add` for missing or outdated required packages. */
export function planConstraintInstalls(
	violations: readonly ConstraintViolation[],
): PlannedPackageInstall[] {
	const planned = new Map<string, PlannedPackageInstall>();

	for (const violation of violations) {
		if (violation.source !== 'policy-constraint-require' || !violation.package) continue;

		const addMatch = violation.remediation?.match(/bun add (@?[^\s@]+(?:\/[^\s@]+)?)(?:@(\S+))?/);
		if (!addMatch) continue;

		const pkg = addMatch[1]!;
		const targetVersion = addMatch[2] ?? 'latest';
		const existing = planned.get(pkg);
		if (!existing) {
			planned.set(pkg, {
				package: pkg,
				version: targetVersion,
				sources: [violation.source],
				ruleIds: violation.ruleId ? [violation.ruleId] : [],
			});
			continue;
		}

		if (!existing.sources.includes(violation.source)) {
			existing.sources.push(violation.source);
		}
		if (violation.ruleId && !existing.ruleIds.includes(violation.ruleId)) {
			existing.ruleIds.push(violation.ruleId);
		}
	}

	return [...planned.values()].sort((a, b) => a.package.localeCompare(b.package));
}

export function formatPlannedRemoval(plan: PlannedPackageRemoval): string {
	const refs = plan.ruleIds.length > 0 ? ` (${plan.ruleIds.join(', ')})` : '';
	return `bun remove ${plan.package}${refs}`;
}

export function formatPlannedInstall(plan: PlannedPackageInstall): string {
	const refs = plan.ruleIds.length > 0 ? ` (${plan.ruleIds.join(', ')})` : '';
	return `bun add ${plan.package}@${plan.version}${refs}`;
}

export interface PlannedSourcePin {
	package: string;
	ruleIds: string[];
}

/** Plan registry pins for blocked git/file dependency specifiers. */
export function planConstraintSourcePins(
	violations: readonly ConstraintViolation[],
): PlannedSourcePin[] {
	const planned = new Map<string, PlannedSourcePin>();
	for (const violation of violations) {
		if (violation.source !== 'policy-constraint-source' || !violation.package) continue;
		const existing = planned.get(violation.package);
		if (!existing) {
			planned.set(violation.package, {
				package: violation.package,
				ruleIds: violation.ruleId ? [violation.ruleId] : [],
			});
			continue;
		}
		if (violation.ruleId && !existing.ruleIds.includes(violation.ruleId)) {
			existing.ruleIds.push(violation.ruleId);
		}
	}
	return [...planned.values()].sort((a, b) => a.package.localeCompare(b.package));
}

export function formatPlannedSourcePin(plan: PlannedSourcePin): string {
	const refs = plan.ruleIds.length > 0 ? ` (${plan.ruleIds.join(', ')})` : '';
	return `bun add ${plan.package}${refs}`;
}

function blockedImportPattern(ruleId?: string): string | null {
	if (!ruleId?.startsWith('constraint-import:')) return null;
	return ruleId.slice('constraint-import:'.length);
}

/** Deduplicated import violations eligible for line removal. */
export function planConstraintImportFixes(
	violations: readonly ConstraintViolation[],
): ConstraintViolation[] {
	const seen = new Set<string>();
	const out: ConstraintViolation[] = [];
	for (const violation of violations) {
		if (violation.source !== 'policy-constraint-import' || !violation.file || !violation.line) {
			continue;
		}
		const key = `${violation.file}:${violation.line}:${violation.ruleId ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(violation);
	}
	return out;
}

/** Remove a blocked or disallowed package via `bun remove`. */
export async function applyPackageRemoval(
	root: string,
	packageName: string,
): Promise<{ok: boolean; message: string}> {
	const result = await runBunPm(root, ['remove', packageName]);
	if (result.ok) {
		return {ok: true, message: `Removed ${packageName}`};
	}
	return {ok: false, message: result.message};
}

/** Install or upgrade a required package via `bun add`. */
export async function applyPackageInstall(
	root: string,
	packageName: string,
	version: string,
): Promise<{ok: boolean; message: string}> {
	const result = await runBunPm(root, ['add', `${packageName}@${version}`]);
	if (result.ok) {
		return {ok: true, message: `Installed ${packageName}@${version}`};
	}
	return {ok: false, message: result.message};
}

/** Pin a blocked source dependency to the latest registry release. */
export async function applySourcePin(
	root: string,
	packageName: string,
): Promise<{ok: boolean; message: string}> {
	const result = await runBunPm(root, ['add', packageName]);
	if (result.ok) {
		return {ok: true, message: `Pinned ${packageName} to registry version`};
	}
	return {ok: false, message: result.message};
}

/** Remove a blocked import line from source. */
export async function applyImportFix(
	root: string,
	violation: ConstraintViolation,
): Promise<{ok: boolean; message: string}> {
	if (!violation.file || !violation.line) {
		return {ok: false, message: 'Import violation missing file location'};
	}

	const pattern = blockedImportPattern(violation.ruleId);
	if (!pattern) {
		return {ok: false, message: 'Import violation missing blocked pattern'};
	}

	const filePath = path.isAbsolute(violation.file)
		? violation.file
		: path.join(root, violation.file);
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		return {ok: false, message: `File not found: ${filePath}`};
	}

	const lines = (await file.text()).split('\n');
	const lineIdx = violation.line - 1;
	if (lineIdx < 0 || lineIdx >= lines.length) {
		return {ok: false, message: `Line ${violation.line} not found in ${filePath}`};
	}

	const line = lines[lineIdx]!;
	if (!line.includes(pattern) && !(violation.snippet && line.includes(violation.snippet))) {
		return {ok: false, message: `Blocked import pattern not found on line ${violation.line}`};
	}

	lines.splice(lineIdx, 1);
	await Bun.write(filePath, lines.join('\n'));
	return {ok: true, message: `Removed blocked import from ${filePath}:${violation.line}`};
}

/** Apply auto-fixable constraint remediations (`bun remove` / `bun add` / import line removal). */
export async function applyConstraintFixes(
	root: string,
	violations: readonly ConstraintViolation[],
): Promise<{
	ok: boolean;
	results: {action: string; target: string; ok: boolean; message: string}[];
}> {
	const results: {action: string; target: string; ok: boolean; message: string}[] = [];

	for (const plan of planConstraintRemovals(violations)) {
		const result = await applyPackageRemoval(root, plan.package);
		results.push({action: 'remove', target: plan.package, ...result});
	}

	for (const plan of planConstraintInstalls(violations)) {
		const result = await applyPackageInstall(root, plan.package, plan.version);
		results.push({action: 'install', target: plan.package, ...result});
	}

	for (const plan of planConstraintSourcePins(violations)) {
		const result = await applySourcePin(root, plan.package);
		results.push({action: 'pin-source', target: plan.package, ...result});
	}

	for (const violation of planConstraintImportFixes(violations)) {
		const result = await applyImportFix(root, violation);
		results.push({
			action: 'import',
			target: `${violation.file}:${violation.line}`,
			...result,
		});
	}

	return {
		ok: results.length > 0 && results.every(entry => entry.ok),
		results,
	};
}
