import {colorize, TERMINAL} from '../color/index.ts';
import type {DomainRegistry} from '../config/registry.ts';
import {domainRegistry} from '../config/registry.ts';
import {formatConstraintViolationLine} from '../intel/constraint-checks.ts';
import {applyConstraintFixes} from '../intel/constraint-remediation.ts';
import {formatEndpointProbeLine} from '../intel/endpoint-probe.ts';
import {Service} from '../service/index.ts';
import {
	applyPlannedUpgrades,
	formatPlannedUpgrade,
	formatRemediationLine,
	planPackageUpgrades,
} from '../intel/semver-remediation.ts';

export interface ScanPackagesCliOptions {
	domain: string;
	root?: string;
	json?: boolean;
	threatFeed?: boolean;
	feedUrl?: string;
	fix?: boolean;
	deep?: boolean;
	probe?: boolean;
	transitive?: boolean;
	path?: string;
	registry?: DomainRegistry;
}

/** Run unified semver checks against installed project dependencies. */
export async function runScanPackagesCli(options: ScanPackagesCliOptions): Promise<number> {
	const registry = options.registry ?? domainRegistry;
	const root = options.root ?? registry.root;

	try {
		await registry.ensureDomain(options.domain);
	} catch (error) {
		console.error(
			colorize(
				TERMINAL.scannerFatal,
				`[scan] ${error instanceof Error ? error.message : String(error)}`,
			),
		);
		return 1;
	}
	if (!registry.has(options.domain)) {
		console.error(colorize(TERMINAL.scannerFatal, `[scan] unknown domain: ${options.domain}`));
		return 1;
	}

	const service = new Service(registry, options.domain);
	const report = await service.scanPackageVersions({
		root,
		threatFeed: options.threatFeed === true || !!options.feedUrl,
		feedUrl: options.feedUrl,
		remediation: true,
		deepConstraints: options.deep === true,
		probeEndpoints: options.probe === true || options.deep === true,
		transitive: options.transitive,
		sourcePath: options.path,
	});

	const constraintCount = report.constraintViolations?.length ?? 0;
	const endpointCount = report.endpointProbes?.violations.length ?? 0;
	const semverCount = report.violations.length;
	const totalViolations = semverCount + constraintCount + endpointCount;

	if (options.json) {
		console.log(JSON.stringify(report, null, 2));
		return totalViolations === 0 ? 0 : 1;
	}

	if (totalViolations === 0) {
		const probeNote =
			report.endpointProbes && report.endpointProbes.probed > 0
				? `, ${report.endpointProbes.probed} endpoint probe(s) ok`
				: '';
		console.error(
			colorize(
				TERMINAL.scannerOk,
				`[scan] ${report.scanned} package(s) satisfy semver policy and constraints${probeNote}${options.threatFeed ? ' and threat feed' : ''}`,
			),
		);
		return 0;
	}

	console.error(
		colorize(
			TERMINAL.scannerWarn,
			`[scan] ${semverCount} semver + ${constraintCount} constraint + ${endpointCount} endpoint violation(s) in ${report.scanned} package(s)`,
		),
	);

	for (const violation of report.violations) {
		const line = formatRemediationLine(violation, violation.remediation);
		const color =
			violation.severity === 'critical' || violation.severity === 'high'
				? TERMINAL.scannerFatal
				: TERMINAL.scannerWarn;
		console.error(colorize(color, `  ${line.replaceAll('\n', '\n  ')}`));
	}

	if (report.constraintViolations && report.constraintViolations.length > 0) {
		for (const violation of report.constraintViolations) {
			const color =
				violation.severity === 'critical' || violation.severity === 'high'
					? TERMINAL.scannerFatal
					: TERMINAL.scannerWarn;
			console.error(
				colorize(
					color,
					`  [constraint] ${formatConstraintViolationLine(violation).replaceAll('\n', '\n  ')}`,
				),
			);
		}
	}

	if (options.fix) {
		const plans = planPackageUpgrades(report.violations);
		if (plans.length > 0) {
			console.error(colorize(TERMINAL.scannerOk, `[scan] applying ${plans.length} upgrade(s):`));
			for (const plan of plans) {
				console.error(colorize(TERMINAL.scannerOk, `  ${formatPlannedUpgrade(plan)}`));
			}
			const applied = await applyPlannedUpgrades(root, plans);
			for (const result of applied.results) {
				console.error(
					colorize(result.ok ? TERMINAL.scannerOk : TERMINAL.scannerFatal, `    ${result.message}`),
				);
			}
		}

		if (report.constraintViolations && report.constraintViolations.length > 0) {
			const applied = await applyConstraintFixes(root, report.constraintViolations);
			for (const result of applied.results) {
				console.error(
					colorize(
						result.ok ? TERMINAL.scannerOk : TERMINAL.scannerFatal,
						`    [constraint ${result.action}] ${result.target}: ${result.message}`,
					),
				);
			}
		}
	}

	return totalViolations > 0 ? 1 : 0;
}
