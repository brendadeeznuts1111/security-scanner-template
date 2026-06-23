import {colorize, severityColor, TERMINAL} from '../color/index.ts';
import {checkAllDomains, type DoctorIssue, type DoctorResult} from '../config/doctor.ts';
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

function formatResult(result: DoctorResult): string {
	const lines: string[] = [];

	if (result.ok) {
		lines.push(colorize(TERMINAL.success, '✓ All domain configs are healthy'));
	} else {
		lines.push(
			colorize(TERMINAL.fatal, `✗ ${result.errors} error(s), ${result.warnings} warning(s)`),
		);
	}

	for (const domain of result.domains) {
		lines.push('');
		lines.push(
			`${domain.ok ? colorize(TERMINAL.success, '✓') : colorize(TERMINAL.fatal, '✗')} ${domain.domain}`,
		);
		lines.push(`  ${domain.path}`);
		for (const issue of domain.issues) {
			lines.push(`  ${formatIssue(issue)}`);
		}
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
		const timing =
			systemCA.enumerationMs !== undefined ? `, ${systemCA.enumerationMs}ms` : '';
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
}

async function peerMetaDoctorResult(
	peerMeta: Awaited<ReturnType<typeof checkPeerDependenciesMeta>>,
	root: string,
): Promise<DoctorResult> {
	const runtimeValidation = validateBunRuntime();
	const crossRef = validateCrossRefApis();
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
	};
}

/**
 * Run the config doctor CLI.
 */
export async function runConfigDoctor(options: ConfigDoctorOptions = {}): Promise<void> {
	const root = options.root ?? process.cwd();

	const timed = options.checkPeerMeta
		? options.benchmark
			? await benchmark('doctor.checkPeerMeta', () => checkPeerDependenciesMeta(root))
			: {result: await checkPeerDependenciesMeta(root), durationMs: 0}
		: options.benchmark
			? await benchmark('doctor.checkAllDomains', () => checkAllDomains(root))
			: {result: await checkAllDomains(root), durationMs: 0};

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
						? (timed.result as Awaited<ReturnType<typeof checkPeerDependenciesMeta>>).packagesScanned
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
			console.error(
				colorize(TERMINAL.warn, `⚠ ${peerMeta.warnings} peer dependency warning(s)`),
			);
			for (const issue of peerMeta.issues) {
				console.error(`  ${formatIssue(issue)}`);
			}
		}
	} else {
		console.error(formatResult(result));
	}

	if (options.benchmark) {
		console.error(colorize(TERMINAL.muted, `Benchmark: ${timed.durationMs.toFixed(2)}ms`));
	}
	process.exit(result.ok ? 0 : 1);
}
