import {colorize, severityColor, TERMINAL} from '../color/index.ts';
import {checkAllDomains, type DoctorIssue, type DoctorResult} from '../config/doctor.ts';
import {formatBrandingShowcase, formatFieldMatrixTable} from '../domain/field-matrix.ts';
import type {DomainFieldSection} from '../domain/field-matrix.ts';
import {checkPeerDependenciesMeta} from '../supply-chain/peer-meta.ts';
import {getSystemCARuntimeInfo} from '../intel/tls/system-ca.ts';
import {getPlatformRuntimeInfo} from '../utils/platform-runtime.ts';
import {getTerminalIORuntimeInfo} from '../utils/terminal-io.ts';
import {getRuntimeInfo, validateBunRuntime} from '../utils/runtime.ts';
import {validateCrossRefApis} from '../xref/index.ts';
import {benchmark} from '../utils/benchmark.ts';

function formatIssue(issue: DoctorIssue): string {
	const label = issue.severity.toUpperCase();
	return `${colorize(severityColor(issue.severity), label)} ${issue.domain} — ${issue.field}: ${issue.message}`;
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
				? colorize(TERMINAL.success, '  snapshot index matches baseline')
				: colorize(TERMINAL.warn, '  snapshot drift detected (see cross-domain checks)'),
		);
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
			lines.push(`  ${formatIssue(issue)}`);
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
	/** Raw argv for native snapshot flag detection. */
	argv?: readonly string[];
}

async function peerMetaDoctorResult(
	peerMeta: Awaited<ReturnType<typeof checkPeerDependenciesMeta>>,
	root: string,
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

	const doctorOptions = {
		matrix: options.matrix === true,
		matrixSection: options.matrixSection,
		snapshot: options.snapshot === true,
		updateSnapshots: options.updateSnapshots === true,
		argv: options.argv ?? process.argv,
		peerMeta: options.checkPeerMeta ? false : undefined,
	};

	const timed = options.checkPeerMeta
		? options.benchmark
			? await benchmark('doctor.checkPeerMeta', () => checkPeerDependenciesMeta(root))
			: {result: await checkPeerDependenciesMeta(root), durationMs: 0}
		: options.benchmark
			? await benchmark('doctor.checkAllDomains', () => checkAllDomains(root, doctorOptions))
			: {result: await checkAllDomains(root, doctorOptions), durationMs: 0};

	const result = options.checkPeerMeta
		? await peerMetaDoctorResult(
				timed.result as Awaited<ReturnType<typeof checkPeerDependenciesMeta>>,
				root,
			)
		: (timed.result as DoctorResult);

	if (options.json) {
		console.log(
			JSON.stringify(
				{
					...result,
					benchmarkMs: options.benchmark ? timed.durationMs : undefined,
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
		process.exit(result.ok ? 0 : 1);
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

	if (options.benchmark) {
		console.error(colorize(TERMINAL.muted, `Benchmark: ${timed.durationMs.toFixed(2)}ms`));
	}
	process.exit(result.ok ? 0 : 1);
}
