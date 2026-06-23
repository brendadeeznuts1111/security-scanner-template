import {colorize, TERMINAL} from '../color/index.ts';
import {checkAllDomains, type DoctorIssue, type DoctorResult} from '../config/doctor.ts';
import type {DomainBrandingProfile} from '../domain/branding.ts';
import {resolveIssueColor} from '../domain/concern-colors.ts';
import {formatBrandingShowcase, formatFieldMatrixTable} from '../domain/field-matrix.ts';
import type {DomainFieldSection} from '../domain/field-matrix.ts';
import {checkPeerDependenciesMeta} from '../supply-chain/peer-meta.ts';
import {getSystemCARuntimeInfo} from '../intel/tls/system-ca.ts';
import {getPlatformRuntimeInfo} from '../utils/platform-runtime.ts';
import {getTerminalIORuntimeInfo} from '../utils/terminal-io.ts';
import {getRuntimeInfo, validateBunRuntime} from '../utils/runtime.ts';
import {validateCrossRefApis} from '../xref/index.ts';
import {benchmark, formatBenchmarkReport, type BenchmarkResult} from '../utils/benchmark.ts';
import {collectBenchmarkRunMetadata} from '../utils/bench-metadata.ts';
import {
	collectDoctorDiagnostics,
	createDoctorTimingSnapshot,
	formatDoctorDiagnosticsInspect,
	formatDoctorDiagnosticsTable,
} from '../utils/doctor-diagnostics.ts';
import {
	formatConfigFormatRuntimeInspect,
	formatConfigFormatRuntimeTable,
	getConfigFormatRuntimeInfo,
} from '../utils/config-format-runtime.ts';
import {
	formatInstallRuntimeInspect,
	formatInstallRuntimeTable,
	getInstallRuntimeInfo,
} from '../utils/install-runtime.ts';
import {createTimer} from '../utils/timing.ts';

function formatIssue(issue: DoctorIssue, branding?: DomainBrandingProfile): string {
	const label = issue.severity.toUpperCase();
	const color = branding
		? resolveIssueColor(
				{colors: branding.colors, channels: branding.channels, errorOverrides: {}},
				issue,
				'bright',
			)
		: issue.severity === 'error'
			? TERMINAL.fatal
			: TERMINAL.warn;
	return `${colorize(color, label)} ${issue.domain} — ${issue.field}: ${issue.message}`;
}

function formatBrandingLine(result: DoctorResult, domain: DoctorResult['domains'][number]): string {
	if (!domain.branding) {
		return '';
	}
	const b = domain.branding;
	return `  branding: ${b.displayName} | service: ${b.service} | report: ${b.report.format} | qr: ${b.qr.enabled ? 'on' : 'off'} | runtime: interactive=${b.runtime.interactive} http3=${b.runtime.http3}`;
}

function formatPackageMetadata(result: DoctorResult): string[] {
	const meta = result.packageMetadata ?? result.snapshot?.document?.metadata.package;
	if (!meta) {
		return [];
	}
	return [
		`  package: ${meta.name}@${meta.version}`,
		`  deps: ${meta.dependencyCount} + ${meta.devDependencyCount} dev | bun: ${meta.bunEngine ?? 'n/a'} | bun-types: ${meta.bunTypesVersion ?? 'n/a'}`,
	];
}

function formatSnapshotReport(result: DoctorResult): string[] {
	const snapshot = result.snapshot;
	if (!snapshot) {
		return [];
	}
	const lines = [
		'',
		colorize(TERMINAL.warn, 'Doctor snapshot'),
		`  bun matcher: ${snapshot.matcherAvailable ? 'available' : 'unavailable'} | update: ${snapshot.updateRequested ? 'yes' : 'no'}`,
	];
	if (snapshot.written.length > 0) {
		lines.push(colorize(TERMINAL.success, `  wrote ${snapshot.written.length} file(s)`));
		for (const file of snapshot.written) {
			lines.push(colorize(TERMINAL.muted, `    ${file}`));
		}
	}
	if (snapshot.compared) {
		lines.push(
			snapshot.ok
				? colorize(TERMINAL.success, '  snapshot index + per-domain baselines match')
				: colorize(TERMINAL.warn, '  snapshot drift detected (see cross-domain checks)'),
		);
	}
	if (snapshot.perDomain.length > 0) {
		lines.push(colorize(TERMINAL.muted, '  per-domain snapshots:'));
		for (const entry of snapshot.perDomain) {
			const status = entry.ok
				? colorize(TERMINAL.success, 'ok')
				: entry.missing
					? colorize(TERMINAL.warn, 'missing')
					: colorize(TERMINAL.warn, 'drift');
			const detail =
				entry.changedSections.length > 0
					? ` [${entry.changedSections.join(', ')}]`
					: entry.fingerprint
						? ` fp:${entry.fingerprint.slice(0, 8)}`
						: '';
			lines.push(colorize(TERMINAL.muted, `    ${entry.domain}: ${status}${detail}`));
		}
	}
	if (snapshot.driftGate) {
		const gate = snapshot.driftGate;
		lines.push('');
		lines.push(
			gate.ok
				? colorize(TERMINAL.success, `  drift gate: ok (sections: ${gate.sections.join(', ')})`)
				: colorize(
						TERMINAL.fatal,
						`  drift gate: FAILED (${gate.violations.length} domain(s), sections: ${gate.sections.join(', ')})`,
					),
		);
		for (const violation of gate.violations) {
			const label = violation.missing ? 'missing baseline' : violation.changedSections.join(', ');
			lines.push(
				colorize(
					TERMINAL.fatal,
					`    ${violation.domain}: ${label} (fp:${violation.fingerprint.slice(0, 8)})`,
				),
			);
		}
	}
	if (snapshot.compatibilityGate) {
		const gate = snapshot.compatibilityGate;
		lines.push('');
		lines.push(
			gate.ok
				? colorize(TERMINAL.success, '  compatibility gate: ok')
				: colorize(
						TERMINAL.fatal,
						`  compatibility gate: FAILED (${gate.violations.length} domain(s))`,
					),
		);
		for (const violation of gate.violations) {
			lines.push(colorize(TERMINAL.fatal, `    ${violation.domain}: ${violation.message}`));
		}
	}
	if (snapshot.snapshotRoot) {
		lines.push(colorize(TERMINAL.muted, `  baseline: ${snapshot.snapshotRoot}`));
	}
	return lines;
}

function formatTemplateCoverage(result: DoctorResult): string[] {
	const coverage = result.templateCoverage;
	const counts = coverage.layerCounts;
	const status = coverage.ok ? colorize(TERMINAL.success, '✓') : colorize(TERMINAL.fatal, '✗');
	return [
		'',
		colorize(TERMINAL.warn, 'Golden template & field matrix'),
		`${status} ${coverage.path}`,
		`  catalog: ${coverage.catalogFields} fields | template=${counts.template} domain=${counts.domain} branding=${counts.branding} service=${counts.service} secrets=${counts.secrets}`,
	];
}

function formatResult(result: DoctorResult, options: ConfigDoctorOptions = {}): string {
	const lines: string[] = [];

	if (result.ok) {
		lines.push(colorize(TERMINAL.success, '✓ All domain configs are healthy'));
	} else {
		lines.push(
			colorize(TERMINAL.fatal, `✗ ${result.errors} error(s), ${result.warnings} warning(s)`),
		);
	}

	lines.push(...formatTemplateCoverage(result));
	lines.push(...formatPackageMetadata(result));
	lines.push(...formatSnapshotReport(result));

	for (const domain of result.domains) {
		lines.push('');
		lines.push(
			`${domain.ok ? colorize(TERMINAL.success, '✓') : colorize(TERMINAL.fatal, '✗')} ${domain.domain}`,
		);
		lines.push(`  ${domain.path}`);
		const brandingLine = formatBrandingLine(result, domain);
		if (brandingLine) {
			lines.push(colorize(TERMINAL.muted, brandingLine));
		}
		if (options.branding && domain.branding) {
			for (const line of formatBrandingShowcase(domain.branding)) {
				lines.push(colorize(TERMINAL.muted, `  ${line}`));
			}
		}
		for (const issue of domain.issues) {
			lines.push(`  ${formatIssue(issue, domain.branding)}`);
		}
		if (options.matrix && domain.matrix?.length) {
			lines.push(
				colorize(
					TERMINAL.muted,
					'  field matrix (template | domain | branding | service | secrets):',
				),
			);
			lines.push(
				formatFieldMatrixTable(domain.matrix, {
					values: true,
					valueRows: domain.matrix,
				})
					.split('\n')
					.map(line => `  ${line}`)
					.join('\n'),
			);
		}
	}

	if (options.matrix && result.matrix?.template.length) {
		lines.push('');
		lines.push(colorize(TERMINAL.warn, 'Template field matrix'));
		lines.push(
			formatFieldMatrixTable(result.matrix.template, {
				values: true,
				valueRows: result.matrix.template,
			}),
		);
	}

	if (result.crossDomainIssues.length > 0) {
		lines.push('');
		lines.push(colorize(TERMINAL.warn, 'Cross-domain checks'));
		for (const issue of result.crossDomainIssues) {
			lines.push(`  ${formatIssue(issue)}`);
		}
	}

	if (result.peerMetaIssues.length > 0) {
		lines.push('');
		lines.push(colorize(TERMINAL.warn, 'Supply-chain peer dependency checks'));
		for (const issue of result.peerMetaIssues) {
			lines.push(`  ${formatIssue(issue)}`);
		}
	}

	const runtime = getRuntimeInfo();
	lines.push('');
	lines.push(colorize(TERMINAL.muted, `Bun ${runtime.version} (${runtime.revision.slice(0, 8)})`));

	const systemCA = result.runtime.systemCA;
	if (systemCA) {
		const countLabel =
			systemCA.systemCount > 0
				? `${systemCA.systemCount} OS trust anchor(s)`
				: 'OS trust store empty';
		const timing = systemCA.enumerationMs !== undefined ? `, ${systemCA.enumerationMs}ms` : '';
		lines.push(
			colorize(
				TERMINAL.muted,
				`System CA: ${countLabel}${timing}${systemCA.macosEnumerationSafe ? '' : ' (upgrade Bun for fast macOS enumeration)'}`,
			),
		);
	}

	const terminalIO = result.runtime.terminalIO;
	if (terminalIO?.pipelineProducer) {
		lines.push(
			colorize(
				TERMINAL.muted,
				terminalIO.pipelinePagerSafe
					? 'Pipeline: stdout is a pipe — pagers (less, fzf, fx) are safe'
					: 'Pipeline: stdout is a pipe — upgrade Bun so pagers keep raw mode',
			),
		);
	} else if (terminalIO?.interactiveSession) {
		lines.push(colorize(TERMINAL.muted, 'Terminal: interactive session (Bun.Terminal / REPL)'));
	}

	if (terminalIO?.windowsConptyNotes?.length) {
		lines.push(colorize(TERMINAL.muted, `ConPTY: ${terminalIO.platformNote}`));
		for (const note of terminalIO.windowsConptyNotes.slice(1, 3)) {
			lines.push(colorize(TERMINAL.muted, `  ${note}`));
		}
	}

	if (terminalIO && !terminalIO.terminalApiAvailable) {
		lines.push(colorize(TERMINAL.muted, 'Warning: Bun.Terminal unavailable — PTY scans disabled'));
	}

	const platform = result.runtime.platform;
	if (platform?.platform === 'win32') {
		const winLabel = platform.windowsRuntimeSafe
			? `Windows runtime OK (paths <= ${platform.maxPathUtf16} UTF-16)`
			: 'Windows: upgrade Bun for path/spawn/connect fixes';
		lines.push(colorize(TERMINAL.muted, winLabel));
	}
	if (platform && !platform.bunTypesTsgoCompatible) {
		lines.push(
			colorize(
				TERMINAL.muted,
				`Types: upgrade bun-types >= 1.4.0 for tsgo (current: ${platform.bunTypesVersion ?? 'unknown'})`,
			),
		);
	}

	const diagnostics = result.runtime.diagnostics;
	if (diagnostics) {
		lines.push('');
		lines.push(colorize(TERMINAL.warn, 'Runtime diagnostics (spawn / signals / timing)'));
		lines.push(
			formatDoctorDiagnosticsTable(diagnostics)
				.split('\n')
				.map(line => (line.length > 0 ? `  ${line}` : line))
				.join('\n'),
		);
		const tty =
			diagnostics.process.stdinIsTTY && diagnostics.process.stdoutIsTTY
				? 'interactive TTY'
				: 'piped or non-TTY';
		lines.push(colorize(TERMINAL.muted, `  session: ${tty} | Ctrl+C → SIGINT`));
	}

	const install = result.runtime.install;
	if (install) {
		lines.push('');
		lines.push(colorize(TERMINAL.warn, 'Bun install (platform / lockfile / peers)'));
		lines.push(
			formatInstallRuntimeTable(install)
				.split('\n')
				.map(line => (line.length > 0 ? `  ${line}` : line))
				.join('\n'),
		);
		if (!install.targetValid) {
			for (const error of install.targetErrors) {
				lines.push(colorize(TERMINAL.fatal, `  ${error}`));
			}
		}
		if (install.installCommand !== 'bun install') {
			lines.push(colorize(TERMINAL.muted, `  cross-target: ${install.installCommand}`));
		}
	}

	const configFormat = result.runtime.configFormat;
	if (configFormat) {
		lines.push('');
		lines.push(colorize(TERMINAL.warn, 'Config formats (JSON5 domains / TOML policy)'));
		lines.push(
			formatConfigFormatRuntimeTable(configFormat)
				.split('\n')
				.map(line => (line.length > 0 ? `  ${line}` : line))
				.join('\n'),
		);
		if (configFormat.invalidFiles.length > 0) {
			for (const invalid of configFormat.invalidFiles) {
				lines.push(
					colorize(
						TERMINAL.fatal,
						`  wrong extension: ${invalid.path} → *${invalid.expectedExtension}`,
					),
				);
			}
		}
		if (configFormat.policyDrift.length > 0) {
			for (const drift of configFormat.policyDrift) {
				lines.push(
					colorize(
						TERMINAL.warn,
						`  policy drift: ${drift.domain} — reconcile JSON5 supplyChain.policy with TOML`,
					),
				);
			}
		}
	}

	return lines.join('\n');
}

export interface ConfigDoctorOptions {
	root?: string;
	json?: boolean;
	benchmark?: boolean;
	/** Run only peerDependenciesMeta supply-chain checks. */
	checkPeerMeta?: boolean;
	/** Print full per-domain field matrix tables. */
	matrix?: boolean;
	/** Print expanded branding + service profile per domain. */
	branding?: boolean;
	/** Limit matrix rows to a section (e.g. branding, secrets, service). */
	matrixSection?: DomainFieldSection;
	/** Capture/compare doctor snapshots with metadata extraction. */
	snapshot?: boolean;
	/** Write snapshots using Bun's native `--update-snapshots` / `-u` flag. */
	updateSnapshots?: boolean;
	/** Override snapshot baseline directory (e.g. `.baseline`). */
	baselineDir?: string;
	/** Fail when snapshot critical sections drift (CI gate). */
	failOnDrift?: boolean;
	/** Comma-separated sections for `--fail-on-drift` (vault,policy,concerns,templateDrift,bundles). */
	driftSections?: string;
	/** Worker count for parallel bundle snapshot hashing during doctor `--snapshot`. */
	workers?: number;
	/** Raw argv for native snapshot flag detection. */
	argv?: readonly string[];
	/** Preview cross-platform install target (`bun install --cpu`). */
	installCpu?: string;
	/** Preview cross-platform install target (`bun install --os`). */
	installOs?: string;
}

async function peerMetaDoctorResult(
	peerMeta: Awaited<ReturnType<typeof checkPeerDependenciesMeta>>,
	root: string,
	installOverride: {cpu?: string; os?: string} = {},
): Promise<DoctorResult> {
	const runtimeValidation = validateBunRuntime();
	const crossRef = validateCrossRefApis();
	const {DOMAIN_FIELD_MATRIX, matrixLayerCounts, validateTemplateFieldCoverage} = await import(
		'../domain/field-matrix.ts'
	);
	const {TEMPLATE_PATH} = await import('../config/loader.ts');
	const {extractPackageMetadata} = await import('../config/package-metadata.ts');
	const templateCoverageRaw = await validateTemplateFieldCoverage();
	return {
		ok: peerMeta.ok,
		domains: [],
		errors: 0,
		warnings: peerMeta.warnings,
		crossDomainIssues: [],
		peerMetaIssues: peerMeta.issues,
		runtime: {
			...runtimeValidation.info,
			apisOk: runtimeValidation.ok,
			missingApis: runtimeValidation.missing,
			crossRef,
			systemCA: getSystemCARuntimeInfo(),
			terminalIO: getTerminalIORuntimeInfo(),
			platform: await getPlatformRuntimeInfo(`${root}/package.json`),
			diagnostics: collectDoctorDiagnostics(),
			install: await getInstallRuntimeInfo(root, installOverride),
			configFormat: await getConfigFormatRuntimeInfo(root),
		},
		templateCoverage: {
			ok: templateCoverageRaw.ok,
			missing: templateCoverageRaw.missing,
			catalogFields: DOMAIN_FIELD_MATRIX.length,
			path: TEMPLATE_PATH,
			layerCounts: matrixLayerCounts(),
		},
		packageMetadata: await extractPackageMetadata(`${root}/package.json`),
	};
}

/**
 * Run the config doctor CLI.
 */
export async function runConfigDoctor(options: ConfigDoctorOptions = {}): Promise<void> {
	const root = options.root ?? process.cwd();
	const timer = createTimer();

	const doctorOptions = {
		matrix: options.matrix === true,
		matrixSection: options.matrixSection,
		snapshot: options.snapshot === true || options.failOnDrift === true,
		updateSnapshots: options.updateSnapshots === true,
		baselineDir: options.baselineDir,
		failOnDrift: options.failOnDrift === true,
		driftSections: options.driftSections,
		argv: options.argv ?? process.argv,
		peerMeta: options.checkPeerMeta ? false : undefined,
		installCpu: options.installCpu,
		installOs: options.installOs,
		workers: options.workers,
	};

	const timed = options.checkPeerMeta
		? options.benchmark
			? await benchmark('doctor.checkPeerMeta', () => checkPeerDependenciesMeta(root), {
					captureHeap: true,
				})
			: {result: await checkPeerDependenciesMeta(root), durationMs: 0}
		: options.benchmark
			? await benchmark('doctor.checkAllDomains', () => checkAllDomains(root, doctorOptions), {
					captureHeap: true,
				})
			: {result: await checkAllDomains(root, doctorOptions), durationMs: 0};

	const result = options.checkPeerMeta
		? await peerMetaDoctorResult(
				timed.result as Awaited<ReturnType<typeof checkPeerDependenciesMeta>>,
				root,
				{cpu: options.installCpu, os: options.installOs},
			)
		: (timed.result as DoctorResult);

	if (options.json) {
		const benchmarkReport = options.benchmark
			? formatBenchmarkReport(
					timed as BenchmarkResult<unknown>,
					await collectBenchmarkRunMetadata({
						heap: true,
						packageJsonPath: `${root}/package.json`,
					}),
				)
			: undefined;
		const timing = createDoctorTimingSnapshot(timer.elapsedNs());

		console.log(
			JSON.stringify(
				{
					...result,
					benchmarkMs: options.benchmark ? timed.durationMs : undefined,
					benchmarkDurationNs:
						options.benchmark && 'durationNs' in timed ? timed.durationNs : undefined,
					benchmark: benchmarkReport,
					timing,
					diagnosticsInspect: formatDoctorDiagnosticsInspect(result.runtime.diagnostics),
					installInspect: result.runtime.install
						? formatInstallRuntimeInspect(result.runtime.install)
						: undefined,
					configFormatInspect: result.runtime.configFormat
						? formatConfigFormatRuntimeInspect(result.runtime.configFormat)
						: undefined,
					packagesScanned: options.checkPeerMeta
						? (timed.result as Awaited<ReturnType<typeof checkPeerDependenciesMeta>>)
								.packagesScanned
						: undefined,
					runtime: {
						...result.runtime,
						revision: result.runtime.revision.slice(0, 8),
					},
				},
				null,
				2,
			),
		);
		process.exit(resolveDoctorExitCode(result, options));
	}

	if (options.checkPeerMeta) {
		const peerMeta = timed.result as Awaited<ReturnType<typeof checkPeerDependenciesMeta>>;
		if (peerMeta.ok) {
			console.error(
				colorize(
					TERMINAL.success,
					`✓ No implicit optional peer dependency issues (${peerMeta.packagesScanned} packages scanned)`,
				),
			);
		} else {
			console.error(colorize(TERMINAL.warn, `⚠ ${peerMeta.warnings} peer dependency warning(s)`));
			for (const issue of peerMeta.issues) {
				console.error(`  ${formatIssue(issue)}`);
			}
		}
	} else {
		console.error(formatResult(result, options));
	}

	const timing = createDoctorTimingSnapshot(timer.elapsedNs());
	if (options.benchmark) {
		const benchmarkNs = 'durationNs' in timed ? timed.durationNs : undefined;
		console.error(
			colorize(
				TERMINAL.muted,
				`Benchmark: ${timed.durationMs.toFixed(2)}ms${benchmarkNs !== undefined ? ` (${benchmarkNs}ns avg)` : ''} | total ${timing.elapsedMs}ms (${timing.elapsedNs}ns)`,
			),
		);
	} else {
		console.error(
			colorize(TERMINAL.muted, `Doctor timing: ${timing.elapsedMs}ms (${timing.elapsedNs}ns)`),
		);
	}
	process.exit(resolveDoctorExitCode(result, options));
}

function resolveDoctorExitCode(result: DoctorResult, options: ConfigDoctorOptions): number {
	if (!result.ok) return 1;
	// Spec §15.3: baseline update always succeeds for CI refresh pipelines.
	if (options.updateSnapshots) return 0;
	if (options.failOnDrift && result.snapshot?.driftGate && !result.snapshot.driftGate.ok) {
		return 1;
	}
	if (
		options.failOnDrift &&
		result.snapshot?.compatibilityGate &&
		!result.snapshot.compatibilityGate.ok
	) {
		return 1;
	}
	return 0;
}
