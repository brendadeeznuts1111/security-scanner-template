import path from 'path';
import {
	constraintsFromDocument,
	hasPolicyConstraints,
	isLicenseConstraintAllowed,
	isPackageConstraintAllowed,
	matchesLicenseToken,
	matchesSourcePattern,
	matchingBlockConstraint,
} from '../policy/constraints.ts';
import type {PolicyDocument} from '../policy/types.ts';
import {SemverMatcher} from '../provider/semver-matcher.ts';
import {scanSourceWithRules} from '../scan/transpiler/analyzer.ts';
import type {TranspilerRule} from '../scan/transpiler/types.ts';
import type {DoctorIssue} from '../config/doctor.ts';
import type {ConstraintViolation} from './constraint-types.ts';
import {
	listAllInstalledPackages,
	readAllProjectDependencySpecifiers,
	readInstalledPackageLicense,
	type InstalledPackageRecord,
} from './constraint-packages.ts';
import type {UnifiedSemverViolation} from './semver-violations.ts';

function toUnified(violation: ConstraintViolation): UnifiedSemverViolation {
	return {
		package: violation.package ?? violation.file ?? 'constraint',
		version: violation.version ?? '0.0.0',
		source: violation.source,
		severity: violation.severity,
		message: violation.message,
		ruleId: violation.ruleId,
	};
}

function packageViolations(
	packages: Record<string, string>,
	constraints: ReturnType<typeof constraintsFromDocument>,
): ConstraintViolation[] {
	const violations: ConstraintViolation[] = [];

	for (const [pkg, version] of Object.entries(packages)) {
		const block = matchingBlockConstraint(pkg, constraints);
		if (block) {
			violations.push({
				category: 'package',
				source: 'policy-constraint-block',
				severity: block.severity ?? 'critical',
				package: pkg,
				version,
				message: `${pkg}@${version} is blocked by policy: ${block.reason}`,
				ruleId: `block:${block.package}`,
				remediation: `Remove with: bun remove ${pkg}`,
			});
		}

		if (constraints.strictAllowlist && !isPackageConstraintAllowed(pkg, constraints)) {
			violations.push({
				category: 'package',
				source: 'policy-constraint-allow',
				severity: 'high',
				package: pkg,
				version,
				message: `${pkg}@${version} is not on the policy allow list`,
				ruleId: 'strict-allowlist',
				remediation: `Add [[constraints.allow]] for ${pkg} or remove the dependency`,
			});
		}
	}

	for (const required of constraints.require ?? []) {
		const version = packages[required.package];
		if (!version) {
			violations.push({
				category: 'require',
				source: 'policy-constraint-require',
				severity: 'high',
				package: required.package,
				version: 'missing',
				message: `Required package ${required.package} is not installed: ${required.reason}`,
				ruleId: `require:${required.package}`,
				remediation: `Install with: bun add ${required.package}${required.range ? `@${required.range}` : ''}`,
			});
			continue;
		}

		if (required.range && !SemverMatcher.satisfies(version, required.range)) {
			violations.push({
				category: 'require',
				source: 'policy-constraint-require',
				severity: 'high',
				package: required.package,
				version,
				message: `${required.package}@${version} does not satisfy required range ${required.range}: ${required.reason}`,
				ruleId: `require:${required.package}`,
				remediation: `Upgrade with: bun add ${required.package}@${required.range}`,
			});
		}
	}

	return violations;
}

async function licenseViolations(
	root: string,
	packages: Record<string, InstalledPackageRecord | string>,
	constraints: ReturnType<typeof constraintsFromDocument>,
): Promise<ConstraintViolation[]> {
	if ((constraints.blockLicense?.length ?? 0) === 0 && !constraints.strictLicenseAllowlist) {
		return [];
	}

	const violations: ConstraintViolation[] = [];
	for (const [pkg, record] of Object.entries(packages)) {
		const version = typeof record === 'string' ? record : record.version;
		const installDir = typeof record === 'string' ? undefined : record.installDir;
		const license = await readInstalledPackageLicense(root, pkg, installDir);
		if (!license) continue;

		for (const blocked of constraints.blockLicense ?? []) {
			if (matchesLicenseToken(license, blocked.license)) {
				violations.push({
					category: 'license',
					source: 'policy-constraint-license',
					severity: blocked.severity ?? 'high',
					package: pkg,
					version,
					message: `${pkg} is licensed as ${license}: ${blocked.reason}`,
					ruleId: `license-block:${blocked.license}`,
					remediation: `Remove or replace ${pkg} — license ${blocked.license} is blocked`,
				});
			}
		}

		if (
			constraints.strictLicenseAllowlist &&
			!isLicenseConstraintAllowed(license, constraints)
		) {
			violations.push({
				category: 'license',
				source: 'policy-constraint-license',
				severity: 'high',
				package: pkg,
				version,
				message: `${pkg} license ${license} is not on the allow list`,
				ruleId: 'strict-license-allowlist',
				remediation: 'Add [[constraints.allowLicense]] or remove the dependency',
			});
		}
	}

	return violations;
}

function sourceViolations(
	specifiers: Awaited<ReturnType<typeof readAllProjectDependencySpecifiers>>,
	constraints: ReturnType<typeof constraintsFromDocument>,
): ConstraintViolation[] {
	if ((constraints.blockSource?.length ?? 0) === 0) {
		return [];
	}

	const violations: ConstraintViolation[] = [];
	for (const dep of specifiers) {
		for (const blocked of constraints.blockSource ?? []) {
			if (!matchesSourcePattern(dep.specifier, blocked.pattern)) continue;
			const scope = dep.workspace ? `${dep.workspace} ` : '';
			violations.push({
				category: 'source',
				source: 'policy-constraint-source',
				severity: blocked.severity ?? 'high',
				package: dep.name,
				version: dep.specifier,
				message: `${scope}${dep.name}@${dep.specifier} (${dep.kind}) matches blocked source ${blocked.pattern}: ${blocked.reason}`,
				ruleId: `source-block:${blocked.pattern}`,
				remediation: `Pin ${dep.name} to a registry version: bun add ${dep.name}`,
			});
		}
	}
	return violations;
}

function matchesImportFileGlob(relativePath: string, globs?: string[]): boolean {
	if (!globs || globs.length === 0) return true;
	for (const glob of globs) {
		if (new Bun.Glob(glob).match(relativePath)) {
			return true;
		}
	}
	return false;
}

async function importViolations(
	root: string,
	scanPath: string,
	constraints: ReturnType<typeof constraintsFromDocument>,
): Promise<{violations: ConstraintViolation[]; scannedFiles: number}> {
	const entries = constraints.blockImport ?? [];
	if (entries.length === 0) {
		return {violations: [], scannedFiles: 0};
	}

	const dir = path.resolve(root, scanPath);
	const globPatterns = new Set<string>();
	for (const entry of entries) {
		for (const glob of entry.fileGlob ?? ['**/*.{js,mjs,cjs,ts,tsx,jsx}']) {
			globPatterns.add(glob);
		}
	}

	const violations: ConstraintViolation[] = [];
	const scanned = new Set<string>();
	let scannedFiles = 0;

	for (const globPattern of globPatterns) {
		const glob = new Bun.Glob(globPattern);
		for await (const relative of glob.scan({cwd: dir, onlyFiles: true})) {
			if (scanned.has(relative)) continue;

			const applicable = entries.filter(entry =>
				matchesImportFileGlob(relative, entry.fileGlob ?? ['**/*.{js,mjs,cjs,ts,tsx,jsx}']),
			);
			if (applicable.length === 0) continue;

			scanned.add(relative);
			scannedFiles += 1;
			const file = path.join(dir, relative);
			const content = await Bun.file(file).text();
			const rules: TranspilerRule[] = applicable.map(entry => ({
				id: `constraint-import:${entry.pattern}`,
				description: entry.reason,
				severity: entry.severity ?? 'high',
				type: 'import',
				importPattern: entry.pattern,
			}));

			for (const finding of scanSourceWithRules(content, file, rules)) {
				violations.push({
					category: 'import',
					source: 'policy-constraint-import',
					severity: finding.severity,
					file: finding.file,
					line: finding.line,
					column: finding.column,
					snippet: finding.snippet,
					message: finding.message,
					ruleId: finding.ruleId,
					remediation: 'Remove or replace the blocked import specifier',
				});
			}
		}
	}

	return {violations, scannedFiles};
}

/** Evaluate package allow/block/require policy constraints. */
export function checkPolicyConstraintViolations(
	packages: Record<string, string>,
	policy: PolicyDocument | null | undefined,
): UnifiedSemverViolation[] {
	const constraints = constraintsFromDocument(policy);
	return packageViolations(packages, constraints).map(toUnified);
}

/** Deep constraint scan across packages, licenses, sources, and imports. */
export async function scanPolicyConstraints(options: {
	root: string;
	policy: PolicyDocument | null | undefined;
	transitive?: boolean;
	sourcePath?: string;
	scanImports?: boolean;
	domain?: string;
}): Promise<import('./constraint-types.ts').ConstraintScanReport> {
	const constraints = constraintsFromDocument(options.policy);
	const useTransitive = options.transitive ?? constraints.scanTransitive === true;
	const installed: InstalledPackageRecord[] = useTransitive
		? await listAllInstalledPackages(options.root)
		: (await import('./semver-checks.ts').then(m => m.readProjectDependencyVersions(options.root))).map(
				pkg => ({...pkg}),
			);
	const packages = Object.fromEntries(installed.map(pkg => [pkg.name, pkg]));

	const packageVersions = Object.fromEntries(
		installed.map(pkg => [pkg.name, pkg.version]),
	) as Record<string, string>;

	const violations: ConstraintViolation[] = [
		...packageViolations(packageVersions, constraints),
		...(await licenseViolations(options.root, packages, constraints)),
		...sourceViolations(await readAllProjectDependencySpecifiers(options.root), constraints),
	];

	let scannedFiles = 0;
	if (options.scanImports !== false && (constraints.blockImport?.length ?? 0) > 0) {
		const importScan = await importViolations(
			options.root,
			options.sourcePath ?? 'src/',
			constraints,
		);
		violations.push(...importScan.violations);
		scannedFiles = importScan.scannedFiles;
	}

	const merged = dedupeConstraintViolations(violations);

	return {
		domain: options.domain,
		root: options.root,
		scannedPackages: Object.keys(packages).length,
		scannedFiles,
		transitive: useTransitive,
		violations: merged,
	};
}

function dedupeConstraintViolations(
	violations: ConstraintViolation[],
): ConstraintViolation[] {
	const seen = new Set<string>();
	const out: ConstraintViolation[] = [];
	for (const violation of violations) {
		const key = `${violation.source}:${violation.ruleId}:${violation.package ?? ''}:${violation.file ?? ''}:${violation.line ?? 0}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(violation);
	}
	return out.sort((a, b) =>
		(a.package ?? a.file ?? '').localeCompare(b.package ?? b.file ?? ''),
	);
}

/** Suppress threat-feed hits for packages on the policy allow list. */
export function filterViolationsByConstraintAllowlist(
	violations: readonly UnifiedSemverViolation[],
	policy: PolicyDocument | null | undefined,
): UnifiedSemverViolation[] {
	const constraints = constraintsFromDocument(policy);
	if ((constraints.allow?.length ?? 0) === 0) {
		return [...violations];
	}

	return violations.filter(violation => {
		if (violation.source !== 'threat-feed') {
			return true;
		}
		return !isPackageConstraintAllowed(violation.package, constraints);
	});
}

const CONSTRAINT_DOCTOR_CODES: Record<ConstraintViolation['source'], string> = {
	'policy-constraint-block': 'POLICY_CONSTRAINT',
	'policy-constraint-allow': 'POLICY_CONSTRAINT',
	'policy-constraint-require': 'POLICY_CONSTRAINT',
	'policy-constraint-import': 'POLICY_CONSTRAINT_IMPORT',
	'policy-constraint-license': 'POLICY_CONSTRAINT_LICENSE',
	'policy-constraint-source': 'POLICY_CONSTRAINT_SOURCE',
};

/** Map a constraint violation to a doctor issue. */
export function constraintViolationToDoctorIssue(
	violation: ConstraintViolation,
	domain: string,
	domainPath: string,
): DoctorIssue {
	const severity =
		violation.severity === 'critical' || violation.severity === 'high' ? 'error' : 'warning';
	const field =
		violation.category === 'import'
			? `policy.constraints.blockImport.${violation.ruleId ?? 'import'}`
			: violation.category === 'license'
				? `policy.constraints.blockLicense.${violation.package ?? 'license'}`
				: violation.category === 'source'
					? `policy.constraints.blockSource.${violation.package ?? 'source'}`
					: violation.source === 'policy-constraint-block'
						? `policy.constraints.block.${violation.package}`
						: violation.source === 'policy-constraint-allow'
							? 'policy.constraints.strictAllowlist'
							: violation.source === 'policy-constraint-require'
								? `policy.constraints.require.${violation.package}`
								: `policy.constraints.${violation.category}`;

	return {
		domain,
		path: domainPath,
		field,
		message: violation.file
			? `${violation.file}${violation.line ? `:${violation.line}` : ''} — ${violation.message}`
			: violation.remediation
				? `${violation.message} (${violation.remediation})`
				: violation.message,
		severity,
		code: CONSTRAINT_DOCTOR_CODES[violation.source],
	};
}

/** Collect deep constraint doctor issues (license, source, import, transitive packages). */
export async function collectConstraintDoctorIssues(
	root: string,
	domain: string,
	domainPath: string,
	policy: PolicyDocument | null | undefined,
): Promise<DoctorIssue[]> {
	const constraints = constraintsFromDocument(policy);
	if (!hasPolicyConstraints(constraints)) {
		return [];
	}

	const hasDeepRules =
		constraints.scanTransitive === true ||
		(constraints.blockLicense?.length ?? 0) > 0 ||
		constraints.strictLicenseAllowlist === true ||
		(constraints.blockSource?.length ?? 0) > 0 ||
		(constraints.blockImport?.length ?? 0) > 0;

	if (!hasDeepRules) {
		return [];
	}

	const report = await scanPolicyConstraints({
		root,
		policy,
		scanImports: true,
		sourcePath: 'src/',
	});

	return report.violations
		.filter(
			violation =>
				violation.category === 'license' ||
				violation.category === 'source' ||
				violation.category === 'import' ||
				(report.transitive && violation.category === 'package'),
		)
		.map(violation => constraintViolationToDoctorIssue(violation, domain, domainPath));
}

export function formatConstraintViolationLine(violation: ConstraintViolation): string {
	const loc = violation.file
		? `${violation.file}${violation.line ? `:${violation.line}` : ''}`
		: violation.package
			? `${violation.package}${violation.version ? `@${violation.version}` : ''}`
			: violation.ruleId ?? 'constraint';
	const lines = [`${violation.severity} [${violation.category}] ${loc} — ${violation.message}`];
	if (violation.remediation) {
		lines.push(`   → ${violation.remediation}`);
	}
	return lines.join('\n');
}