import {statSync} from 'fs';
import path from 'path';
import {colorize, TERMINAL} from '../color/index.ts';
import type {DomainRegistry} from '../config/registry.ts';
import {Service} from '../service/index.ts';
import {
	formatTranspilerReport,
	hasCriticalFindings,
	loadProjectTranspilerRules,
	resolveTranspilerRules,
	scanBundle as scanSingleBundle,
	scanSourceWithRules,
	type TranspilerReportFormat,
	type TranspilerScanReport,
} from '../scan/transpiler.ts';
import {benchmark} from '../utils/benchmark.ts';
import {patchDomainSnapshotBundles, resolveSnapshotRoot} from '../domain/doctor-snapshot.ts';
import {computeBundleSnapshotAtPath} from '../domain/doctor-snapshot-bundles.ts';

export interface TranspilerBundleCliOptions {
	path: string;
	domain?: string;
	rules?: string[];
	format?: TranspilerReportFormat;
	output?: string;
	verifyIntegrity?: boolean;
	updateSnapshot?: boolean;
	failOnBundleDrift?: boolean;
	baselineDir?: string;
	json?: boolean;
	markdown?: boolean;
	html?: boolean;
	registry?: DomainRegistry;
	/** Print markdown/html report body to stdout (supply-chain scan CLI). */
	emitFormattedStdout?: boolean;
	profile?: string;
}

function resolveFormat(options: TranspilerBundleCliOptions): TranspilerReportFormat {
	if (options.format) return options.format;
	if (options.markdown) return 'markdown';
	if (options.html) return 'html';
	if (options.json) return 'json';
	return 'json';
}

async function scanSingleFile(
	filePath: string,
	rules: string[] | undefined,
	root: string,
): Promise<TranspilerScanReport> {
	const started = performance.now();
	const absolute = path.resolve(filePath);
	const loaded = await loadProjectTranspilerRules(root);
	const resolved = resolveTranspilerRules(loaded, rules);
	const source = await Bun.file(absolute).text();
	const findings = scanSourceWithRules(source, absolute, resolved);
	const legacy = findings.length === 0 ? await scanSingleBundle(absolute) : null;
	const mergedFindings =
		findings.length > 0
			? findings
			: (legacy?.findings.map(finding => ({
					type: 'transpiler' as const,
					file: absolute,
					line: finding.line,
					ruleId: finding.id,
					severity: (finding.severity === 'fatal' ? 'critical' : 'medium') as 'critical' | 'medium',
					message: finding.description,
					category: finding.category,
				})) ?? []);

	return {
		root,
		scannedFiles: 1,
		findings: mergedFindings,
		files: [
			{
				path: absolute,
				bytes: source.length,
				hash: '',
				findings: mergedFindings,
			},
		],
		durationMs: performance.now() - started,
	};
}

export async function runTranspilerBundleCli(options: TranspilerBundleCliOptions): Promise<number> {
	const root = process.cwd();
	const target = path.resolve(options.path);
	const format = resolveFormat(options);

	let report: TranspilerScanReport;

	if (options.domain && options.registry) {
		await options.registry.loadAll();
		if (!options.registry.has(options.domain)) {
			console.error(colorize(TERMINAL.scannerFatal, `[scan] unknown domain: ${options.domain}`));
			return 1;
		}

		const timed = await benchmark('scan.bundle', () => {
			const service = new Service(options.registry!, options.domain!);
			return service.scanBundles({
				path: target,
				rules: options.rules,
				verifyIntegrity: options.verifyIntegrity,
				checkBundleDrift: true,
				includeSemverPolicy: true,
			});
		});
		report = {...timed.result, durationMs: timed.durationMs};
	} else {
		const timed = await benchmark('scan.bundle', async () => {
			let stat: ReturnType<typeof statSync>;
			try {
				stat = statSync(target);
			} catch {
				throw new Error(`Path not found: ${options.path}`);
			}

			if (stat.isFile()) {
				return scanSingleFile(target, options.rules, root);
			}

			const {scanDirectory} = await import('../scan/transpiler/index.ts');
			return scanDirectory({
				root: target,
				ruleIds: options.rules,
				verifyIntegrity: options.verifyIntegrity,
			});
		});
		report = {...timed.result, durationMs: timed.durationMs};
	}

	const body = formatTranspilerReport(report, format);

	if (options.profile) {
		console.error(
			colorize(TERMINAL.scannerDim, `[scan] profile=${options.profile}`),
		);
	}

	if (options.output) {
		await Bun.write(options.output, body);
	}

	if (format === 'json' || options.json) {
		console.log(body);
	} else if ((format === 'markdown' || format === 'html') && options.emitFormattedStdout && !options.output) {
		console.log(body);
	} else if (!options.output) {
		console.error(
			colorize(
				TERMINAL.scannerInfo,
				`[scan] ${report.scannedFiles} file(s), ${report.findings.length} finding(s)${report.durationMs !== undefined ? ` in ${report.durationMs.toFixed(2)}ms` : ''}`,
			),
		);
		for (const finding of report.findings) {
			const color =
				finding.severity === 'critical' || finding.severity === 'high'
					? TERMINAL.scannerFatal
					: TERMINAL.scannerWarn;
			const loc = finding.line !== undefined ? `${finding.file}:${finding.line}` : finding.file;
			console.error(
				colorize(color, `  ${finding.severity} ${finding.ruleId}: ${finding.message} (${loc})`),
			);
		}
	} else {
		console.error(
			colorize(TERMINAL.scannerOk, `[scan] wrote ${format} report to ${options.output}`),
		);
	}

	if (report.snapshotCompatibility && !report.snapshotCompatibility.ok) {
		console.error(
			colorize(
				TERMINAL.scannerFatal,
				`[scan] snapshot incompatible: ${report.snapshotCompatibility.message ?? 'scanner or schema mismatch'}`,
			),
		);
		if (report.snapshotCompatibility.migrationHint) {
			console.error(
				colorize(TERMINAL.scannerWarn, `  ${report.snapshotCompatibility.migrationHint}`),
			);
		}
	}

	if (report.bundleDrift?.changed) {
		console.error(
			colorize(
				TERMINAL.scannerWarn,
				`[scan] bundle hash drift detected (${report.bundleDrift.previousHash?.slice(0, 8)} → ${report.bundleDrift.currentHash.slice(0, 8)})`,
			),
		);
	}

	if (report.semverViolations && report.semverViolations.length > 0) {
		console.error(
			colorize(
				TERMINAL.scannerWarn,
				`[scan] ${report.semverViolations.length} semver policy violation(s)`,
			),
		);
		for (const violation of report.semverViolations) {
			console.error(
				colorize(
					TERMINAL.scannerFatal,
					`  ${violation.package}@${violation.version} — ${violation.ruleId}: ${violation.description}`,
				),
			);
		}
	}

	if (options.updateSnapshot && options.domain) {
		const snapshotRoot = resolveSnapshotRoot(root, options.baselineDir);
		const bundles = await computeBundleSnapshotAtPath(root, options.path);
		if (bundles) {
			const patched = await patchDomainSnapshotBundles(snapshotRoot, options.domain, bundles);
			if (patched) {
				console.error(
					colorize(
						TERMINAL.scannerOk,
						`[scan] updated bundle snapshot for ${options.domain} (hash ${bundles.hash.slice(0, 8)}…)`,
					),
				);
			} else {
				console.error(
					colorize(
						TERMINAL.scannerWarn,
						`[scan] no baseline for ${options.domain} — run doctor --snapshot -u first`,
					),
				);
			}
		}
	}

	if (options.failOnBundleDrift && report.snapshotCompatibility && !report.snapshotCompatibility.ok) {
		return 1;
	}
	if (options.failOnBundleDrift && report.bundleDrift?.changed) {
		return 1;
	}
	if (report.semverViolations?.some(v => v.severity === 'critical' || v.severity === 'high')) {
		return 1;
	}

	return hasCriticalFindings(report.findings) ? 1 : 0;
}
