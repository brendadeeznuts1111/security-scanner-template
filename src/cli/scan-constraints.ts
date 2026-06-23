import {colorize, TERMINAL} from '../color/index.ts';
import type {DomainRegistry} from '../config/registry.ts';
import {domainRegistry} from '../config/registry.ts';
import {formatConstraintViolationLine} from '../intel/constraint-checks.ts';
import {
	applyConstraintFixes,
	formatPlannedInstall,
	formatPlannedRemoval,
	formatPlannedSourcePin,
	planConstraintImportFixes,
	planConstraintInstalls,
	planConstraintRemovals,
	planConstraintSourcePins,
} from '../intel/constraint-remediation.ts';
import {Service} from '../service/index.ts';

export interface ScanConstraintsCliOptions {
	domain: string;
	root?: string;
	path?: string;
	transitive?: boolean;
	imports?: boolean;
	noImports?: boolean;
	json?: boolean;
	fix?: boolean;
	registry?: DomainRegistry;
}

/** Run deep policy constraint scans (packages, licenses, sources, imports). */
export async function runScanConstraintsCli(options: ScanConstraintsCliOptions): Promise<number> {
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
	const report = await service.scanConstraints({
		root,
		transitive: options.transitive,
		sourcePath: options.path,
		scanImports: options.noImports ? false : options.imports !== false,
	});

	if (options.json) {
		console.log(JSON.stringify(report, null, 2));
		return report.violations.length === 0 ? 0 : 1;
	}

	if (report.violations.length === 0) {
		const scope = report.transitive ? 'transitive' : 'direct';
		console.log(
			colorize(
				TERMINAL.scannerOk,
				`✅ No constraint violations (${report.scannedPackages} ${scope} package(s)${report.scannedFiles > 0 ? `, ${report.scannedFiles} source file(s)` : ''}).`,
			),
		);
		return 0;
	}

	console.error(
		colorize(
			TERMINAL.scannerWarn,
			`[scan] ${report.violations.length} constraint violation(s) — ${report.scannedPackages} package(s)${report.transitive ? ' (transitive)' : ''}`,
		),
	);

	for (const violation of report.violations) {
		const color =
			violation.severity === 'critical' || violation.severity === 'high'
				? TERMINAL.scannerFatal
				: TERMINAL.scannerWarn;
		console.error(
			colorize(color, `  ${formatConstraintViolationLine(violation).replaceAll('\n', '\n  ')}`),
		);
	}

	if (options.fix) {
		const removals = planConstraintRemovals(report.violations);
		const installs = planConstraintInstalls(report.violations);
		const pins = planConstraintSourcePins(report.violations);
		const imports = planConstraintImportFixes(report.violations);

		if (removals.length === 0 && installs.length === 0 && pins.length === 0 && imports.length === 0) {
			console.error(
				colorize(TERMINAL.scannerWarn, '[scan] no auto-fix targets for these violations'),
			);
		} else {
			for (const plan of removals) {
				console.error(colorize(TERMINAL.scannerOk, `  ${formatPlannedRemoval(plan)}`));
			}
			for (const plan of installs) {
				console.error(colorize(TERMINAL.scannerOk, `  ${formatPlannedInstall(plan)}`));
			}
			for (const plan of pins) {
				console.error(colorize(TERMINAL.scannerOk, `  ${formatPlannedSourcePin(plan)}`));
			}
			for (const violation of imports) {
				console.error(
					colorize(
						TERMINAL.scannerOk,
						`  remove import ${violation.file}:${violation.line} (${violation.ruleId})`,
					),
				);
			}
			const applied = await applyConstraintFixes(root, report.violations);
			for (const result of applied.results) {
				console.error(
					colorize(
						result.ok ? TERMINAL.scannerOk : TERMINAL.scannerFatal,
						`    [${result.action}] ${result.target}: ${result.message}`,
					),
				);
			}
		}
	}

	return 1;
}