#!/usr/bin/env bun
import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import {domainRegistry} from '../config/registry.ts';
import {runQrCli} from './qr.ts';
import {runTlsCli} from './tls.ts';
import {runBenchCli} from './bench.ts';
import {runConfigDoctor} from './config-doctor.ts';
import {Service} from '../service/index.ts';
import {runTool} from '../scan/tools.ts';
import {runTranspilerBundleCli} from './transpiler-bundle.ts';
import {runScanPackagesCli} from './scan-packages.ts';
import {runScanPatternsCli} from './scan-patterns.ts';
import {runScanConstraintsCli} from './scan-constraints.ts';
import {runNetworkCli} from './network.ts';
import {runWorkflowCli} from './workflow.ts';
import {SecurityShell} from '../interactive/index.ts';
import {cliBoolean, cliString, runCliIfMain} from '../utils/cli.ts';
import {exitIfNotInteractive, spawnInheritAndExit, writeJsonStdout} from '../utils/process.ts';
import {waitForInterruptSignal} from '../utils/signals.ts';

const HELP = `Usage:
  bun sp [shell] [--domain <reverse-dns-domain>]
  bun sp start --domain <reverse-dns-domain> [--port N] [--http3] [--no-http1] [--watch]
  bun sp audit thumbnail --id <audit-id> --input <image> --domain <domain>
  bun sp qr --domain <name> [--terminal] [--format svg|png|webp] [--out path] [--size N] [--dark #hex] [--light #hex]
  bun sp qr --text <value> --out <path>
  bun sp report --image --html <path> [--out <path>]
  bun sp tls --domain <name> --host <hostname> [--use-system-ca|--no-use-system-ca] [--deep] [--port 443] [--json]
  bun sp doctor [--snapshot] [--update-snapshots|-u] [--fail-on-drift] [--sections vault,policy,concerns,templateDrift,bundles] [--workers <n>] [--baseline-dir <path>] [--matrix] [--branding] [--matrix-section <name>] [--json] [--benchmark] [--install-cpu <arch>] [--install-os <os>] [--root <path>]
  bun sp doctor --json | fx    # piped pagers work on Bun >= 1.3.14
  bun sp bench [--suite doctor|field-matrix|domain-load|artifact-spec|ground-truth|all] [--json] [--root <path>]
  bun sp scan --domain <name> [--tool trivy] [--json] [-- <scanner-args...>]
  bun sp scan packages --domain <name> [--root <path>] [--deep] [--probe] [--transitive] [--path src/] [--threat-feed] [--feed-url <url>] [--fix] [--json]
  bun sp scan source --domain <name> [--path src/] [--root <path>] [--fix] [--json]
  bun sp scan constraints --domain <name> [--root <path>] [--path src/] [--transitive] [--no-imports] [--fix] [--json]
  bun sp scan bundle --domain <name> --path <dir|file> [--rules id,id] [--format json|markdown|html] [--output path] [--verify-integrity] [--update-snapshot] [--fail-on-bundle-drift] [--baseline-dir <path>] [--json]
  bun sp network start --domain <name> [--health-url-secret name] [--baseline path] [--fail-on-drift] [--json] [--herdr-tab]
  bun sp network start --all
  bun sp network stop --domain <name>
  bun sp network status --domain <name> [--json]
  bun sp workflow run --domain <name> [--scanners network,semver,patterns,tls,dns] [--output json|ndjson|herdr|table] [--dry-run] [--fail-on-issue] [--seed <path>] [--seed-write <path>] [--fail-on-drift]
  bun sp workflow start --domain <name> [--interval 60000] [--watch] [--output ndjson] [--seed <path>] [--fail-on-drift]
  bun sp workflow status --domain <name> [--json]

Enter the interactive security operator REPL, start a domain service, or run one-shot commands.

Commands inside the shell:
  help, domain, domains, status, colors, badge, features, profiles, scan,
  audit tail [--follow] | audit thumbnail --id <id> --input <path> (tail lines pipe to jq/fx),
  qr [--terminal] [--format svg|png|webp] [--out path] [--dark #hex] [--light #hex],
  qr --text <value> --out <path>, report --image --html <path>,
  tls --host <hostname> [--port N] [--use-system-ca|--no-use-system-ca] [--deep],
  build --profile <name>, secrets [status], exit`;

async function runShell(domain?: string): Promise<void> {
	exitIfNotInteractive('bun sp shell');

	const shell = new SecurityShell(domainRegistry, {domain});
	await shell.start();
}

async function runStart(values: {
	'domain'?: string;
	'port'?: string;
	'http3'?: boolean;
	'no-http1'?: boolean;
	'watch'?: boolean;
}): Promise<void> {
	const domain = values.domain;
	if (!domain) {
		console.error(colorize(TERMINAL.scannerFatal, '[sp] start requires --domain <name>'));
		process.exit(1);
	}

	await domainRegistry.loadAll();
	if (!domainRegistry.has(domain)) {
		console.error(colorize(TERMINAL.scannerFatal, `[sp] unknown domain: ${domain}`));
		process.exit(1);
	}

	const port = values.port ? Number(values.port) : undefined;
	if (values.port && !Number.isFinite(port)) {
		console.error(colorize(TERMINAL.scannerFatal, '[sp] --port must be a number'));
		process.exit(1);
	}

	const service = await domainRegistry.service(domain, undefined, {
		port,
		http3: values.http3 ?? undefined,
		http1: values['no-http1'] ? false : undefined,
	});

	const boundPort = service.boundPort ?? 0;
	const hostname = service.boundHostname ?? '0.0.0.0';
	const protocol = values.http3 ? 'https+http3' : 'http';
	console.error(
		colorize(
			TERMINAL.scannerOk,
			`[sp] serving ${domain} at ${protocol}://${hostname}:${boundPort}`,
		),
	);

	if (values.watch) {
		domainRegistry.watch({
			onReload: event => {
				console.error(
					colorize(TERMINAL.scannerInfo, `[sp] reloaded ${event.domain} (${event.type})`),
				);
			},
		});
		console.error(colorize(TERMINAL.scannerDim, '[sp] watching domains/ for config changes'));
	}

	console.error(colorize(TERMINAL.scannerDim, '[sp] press Ctrl+C to stop'));
	await waitForInterruptSignal();
}

async function runDelegatedVisual(args: string[]): Promise<void> {
	await spawnInheritAndExit(['bun', 'run', 'src/cli/visual.ts', ...args]);
}

async function main(): Promise<void> {
	const {values, positionals} = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			'domain': {type: 'string'},
			'port': {type: 'string'},
			'http3': {type: 'boolean'},
			'no-http1': {type: 'boolean'},
			'watch': {type: 'boolean'},
			'id': {type: 'string'},
			'input': {type: 'string'},
			'text': {type: 'string'},
			'size': {type: 'string'},
			'format': {type: 'string'},
			'dark': {type: 'string'},
			'light': {type: 'string'},
			'terminal': {type: 'boolean'},
			'output': {type: 'string'},
			'out': {type: 'string'},
			'html': {type: 'string'},
			'image': {type: 'boolean'},
			'json': {type: 'boolean'},
			'root': {type: 'string'},
			'check-peer-meta': {type: 'boolean'},
			'install-cpu': {type: 'string'},
			'install-os': {type: 'string'},
			'matrix': {type: 'boolean'},
			'branding': {type: 'boolean'},
			'snapshot': {type: 'boolean'},
			'update-snapshots': {type: 'boolean', short: 'u'},
			'baseline-dir': {type: 'string'},
			'fail-on-drift': {type: 'boolean'},
			'sections': {type: 'string'},
			'matrix-section': {type: 'string'},
			'benchmark': {type: 'boolean'},
			'suite': {type: 'string'},
			'tool': {type: 'string'},
			'path': {type: 'string'},
			'rules': {type: 'string'},
			'verify-integrity': {type: 'boolean'},
			'threat-feed': {type: 'boolean'},
			'feed-url': {type: 'string'},
			'fix': {type: 'boolean'},
			'transitive': {type: 'boolean'},
			'probe': {type: 'boolean'},
			'health-url': {type: 'string'},
			'health-url-secret': {type: 'string'},
			'baseline': {type: 'string'},
			'update-baseline': {type: 'boolean'},
			'fail-on-health': {type: 'boolean'},
			'herdr-tab': {type: 'boolean'},
			'no-color': {type: 'boolean'},
			'all': {type: 'boolean'},
			'no-imports': {type: 'boolean'},
			'update-snapshot': {type: 'boolean'},
			'fail-on-bundle-drift': {type: 'boolean'},
			'workers': {type: 'string'},
			'host': {type: 'string'},
			'use-system-ca': {type: 'boolean'},
			'deep': {type: 'boolean'},
			'scanners': {type: 'string'},
			'interval': {type: 'string'},
			'dry-run': {type: 'boolean'},
			'fail-on-issue': {type: 'boolean'},
			'seed': {type: 'string'},
			'seed-write': {type: 'string'},
			'fail-on-severity': {type: 'string'},
			'tls-host': {type: 'string'},
			'tls-port': {type: 'string'},
			'tls-deep': {type: 'boolean'},
			'help': {type: 'boolean', short: 'h'},
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(HELP);
		process.exit(0);
	}

	const command = positionals[0] ?? 'shell';
	const outPath = values.output ?? values.out;

	switch (command) {
		case 'shell':
			await runShell(values.domain);
			return;
		case 'start':
			await runStart(values);
			return;
		case 'audit':
			if (positionals[1] === 'thumbnail') {
				const flags = [
					'audit',
					'thumbnail',
					'--id',
					values.id ?? '',
					'--input',
					values.input ?? '',
					'--domain',
					values.domain ?? '',
				];
				await runDelegatedVisual(flags);
				return;
			}
			break;
		case 'qr': {
			if (values.domain && !values.text) {
				const size = values.size ? Number(values.size) : undefined;
				await runQrCli({
					domain: values.domain,
					output: outPath,
					size,
					terminal: values.terminal,
					format: values.format,
					dark: values.dark,
					light: values.light,
				});
				return;
			}

			const flags = ['qr', '--text', values.text ?? '', '--output', outPath ?? ''];
			if (values.domain) {
				flags.push('--domain', values.domain);
			}
			await runDelegatedVisual(flags);
			return;
		}
		case 'report':
			if (values.image) {
				const flags = ['report-image', '--html', values.html ?? ''];
				if (outPath) {
					flags.push('--output', outPath);
				}
				await runDelegatedVisual(flags);
				return;
			}
			break;
		case 'tls': {
			const exitCode = await runTlsCli({
				domain: values.domain,
				host: values.host ?? values.domain,
				port: values.port ? Number(values.port) : undefined,
				useSystemCA: values['use-system-ca'],
				deep: values.deep,
				json: values.json === true,
			});
			process.exit(exitCode);
		}
		case 'scan': {
			if (positionals[1] === 'packages') {
				const domain = values.domain;
				if (!domain) {
					console.error(
						colorize(TERMINAL.scannerFatal, '[sp] scan packages requires --domain <name>'),
					);
					process.exit(1);
				}
				const exitCode = await runScanPackagesCli({
					domain,
					root: values.root,
					path: values.path,
					deep: values.deep === true,
					probe: values.probe === true,
					transitive: values.transitive === true,
					json: values.json === true,
					threatFeed: values['threat-feed'] === true,
					feedUrl: typeof values['feed-url'] === 'string' ? values['feed-url'] : undefined,
					fix: values.fix === true,
					registry: domainRegistry,
				});
				process.exit(exitCode);
			}

			if (positionals[1] === 'source') {
				const domain = values.domain;
				if (!domain) {
					console.error(
						colorize(TERMINAL.scannerFatal, '[sp] scan source requires --domain <name>'),
					);
					process.exit(1);
				}
				const exitCode = await runScanPatternsCli({
					domain,
					path: values.path,
					root: values.root,
					json: values.json === true,
					fix: values.fix === true,
					registry: domainRegistry,
				});
				process.exit(exitCode);
			}

			if (positionals[1] === 'constraints') {
				const domain = values.domain;
				if (!domain) {
					console.error(
						colorize(TERMINAL.scannerFatal, '[sp] scan constraints requires --domain <name>'),
					);
					process.exit(1);
				}
				const exitCode = await runScanConstraintsCli({
					domain,
					path: values.path,
					root: values.root,
					transitive: values.transitive === true,
					noImports: values['no-imports'] === true,
					json: values.json === true,
					fix: values.fix === true,
					registry: domainRegistry,
				});
				process.exit(exitCode);
			}

			if (positionals[1] === 'bundle') {
				const domain = values.domain;
				const bundlePath = values.path ?? positionals[2];
				if (!bundlePath) {
					console.error(
						colorize(TERMINAL.scannerFatal, '[sp] scan bundle requires --path <dir|file>'),
					);
					process.exit(1);
				}
				const rules = values.rules
					?.split(',')
					.map(rule => rule.trim())
					.filter(Boolean);
				const format =
					values.format === 'json' || values.format === 'markdown' || values.format === 'html'
						? values.format
						: undefined;
				const exitCode = await runTranspilerBundleCli({
					path: bundlePath,
					domain,
					rules,
					format,
					output: values.output ?? values.out,
					verifyIntegrity: values['verify-integrity'] === true,
					updateSnapshot: values['update-snapshot'] === true,
					failOnBundleDrift: values['fail-on-bundle-drift'] === true,
					baselineDir:
						typeof values['baseline-dir'] === 'string' ? values['baseline-dir'] : undefined,
					json: values.json === true,
					markdown: values.format === 'markdown',
					html: values.format === 'html',
					registry: domainRegistry,
				});
				process.exit(exitCode);
			}

			const domain = values.domain;
			if (!domain) {
				console.error(colorize(TERMINAL.scannerFatal, '[sp] scan requires --domain <name>'));
				process.exit(1);
			}

			await domainRegistry.loadAll();
			if (!domainRegistry.has(domain)) {
				console.error(colorize(TERMINAL.scannerFatal, `[sp] unknown domain: ${domain}`));
				process.exit(1);
			}

			const tool = values.tool ?? 'trivy';
			const dashIndex = Bun.argv.indexOf('--');
			const scannerArgs =
				dashIndex >= 0
					? Bun.argv.slice(dashIndex + 1)
					: positionals.slice(1).filter(arg => arg !== '--');

			if (values.json === true) {
				const result = await runTool(tool, {
					args: scannerArgs.length > 0 ? scannerArgs : ['--version'],
				});
				writeJsonStdout({domain, tool, ...result});
				process.exit(result.exitCode === 0 ? 0 : 1);
			}

			exitIfNotInteractive('bun sp scan');
			const service = new Service(domainRegistry, domain);
			const result = await service.runInteractiveScanner(tool, scannerArgs);
			process.exit(result.exitCode === 0 ? 0 : 1);
		}
		case 'bench': {
			await runBenchCli({
				suite:
					typeof values.suite === 'string' &&
					[
						'doctor',
						'field-matrix',
						'domain-load',
						'artifact-spec',
						'ground-truth',
						'all',
					].includes(values.suite)
						? (values.suite as import('./bench.ts').BenchSuite)
						: 'all',
				json: values.json === true,
				root: values.root,
			});
			return;
		}
		case 'workflow': {
			const subcommand = (positionals[1] ?? 'run') as 'run' | 'start' | 'status';
			if (subcommand !== 'run' && subcommand !== 'start' && subcommand !== 'status') {
				console.error(
					colorize(
						TERMINAL.scannerFatal,
						`[sp] workflow requires run|start|status (got ${positionals[1] ?? '(none)'})`,
					),
				);
				process.exit(1);
			}
			const domain = values.domain;
			if (!domain) {
				console.error(colorize(TERMINAL.scannerFatal, '[sp] workflow requires --domain <name>'));
				process.exit(1);
			}
			const scanners = cliString(values.scanners)
				?.split(',')
				.map(entry => entry.trim())
				.filter(entry => entry.length > 0);
			const intervalRaw = cliString(values.interval);
			const tlsPortRaw = cliString(values['tls-port']);
			const exitCode = await runWorkflowCli({
				command: subcommand,
				domain,
				scanners,
				interval: intervalRaw ? Number.parseInt(intervalRaw, 10) : undefined,
				watch: cliBoolean(values.watch),
				output: cliString(values.output) as
					| import('../workflow/types.ts').WorkflowOutputFormat
					| undefined,
				dryRun: cliBoolean(values['dry-run']),
				failOnIssue: cliBoolean(values['fail-on-issue']),
				failOnDrift: cliBoolean(values['fail-on-drift']),
				seedPath: cliString(values.seed),
				seedWritePath: cliString(values['seed-write']),
				failOnSeverity: cliString(values['fail-on-severity']) as
					| import('../workflow/types.ts').WorkflowLoopOptions['failOnSeverity']
					| undefined,
				tlsHost: cliString(values['tls-host']),
				tlsPort: tlsPortRaw ? Number.parseInt(tlsPortRaw, 10) : undefined,
				tlsDeep: cliBoolean(values['tls-deep']) ?? cliBoolean(values.deep),
				json: values.json === true,
				registry: domainRegistry,
			});
			process.exit(exitCode);
		}
		case 'network': {
			const subcommand = positionals[1];
			if (subcommand !== 'start' && subcommand !== 'stop' && subcommand !== 'status') {
				console.error(
					colorize(
						TERMINAL.scannerFatal,
						`[sp] network requires start|stop|status (got ${subcommand ?? '(none)'})`,
					),
				);
				process.exit(1);
			}
			if (subcommand === 'start' && !values.domain && values.all !== true) {
				console.error(
					colorize(TERMINAL.scannerFatal, '[sp] network start requires --domain or --all'),
				);
				process.exit(1);
			}
			if ((subcommand === 'stop' || subcommand === 'status') && !values.domain) {
				console.error(colorize(TERMINAL.scannerFatal, '[sp] network requires --domain <name>'));
				process.exit(1);
			}
			const exitCode = await runNetworkCli({
				domain: values.domain as string | undefined,
				command: subcommand,
				healthUrl: values['health-url'] as string | undefined,
				healthUrlSecret: values['health-url-secret'] as string | undefined,
				baseline: values.baseline as string | undefined,
				updateBaseline: values['update-baseline'] === true,
				failOnHealth: values['fail-on-health'] === true,
				failOnDrift: values['fail-on-drift'] === true,
				json: values.json === true,
				herdrTab: values['herdr-tab'] === true,
				noColor: values['no-color'] === true,
				all: values.all === true,
				registry: domainRegistry,
			});
			process.exit(exitCode);
		}
		case 'doctor': {
			const matrixSection =
				typeof values['matrix-section'] === 'string' ? values['matrix-section'] : undefined;
			await runConfigDoctor({
				root: values.root,
				json: values.json === true,
				benchmark: values.benchmark === true,
				argv: Bun.argv,
				checkPeerMeta: values['check-peer-meta'] === true,
				installCpu: typeof values['install-cpu'] === 'string' ? values['install-cpu'] : undefined,
				installOs: typeof values['install-os'] === 'string' ? values['install-os'] : undefined,
				matrix: values.matrix === true,
				branding: values.branding === true,
				snapshot:
					values.snapshot === true ||
					values['update-snapshots'] === true ||
					values['fail-on-drift'] === true,
				updateSnapshots: values['update-snapshots'] === true,
				baselineDir:
					typeof values['baseline-dir'] === 'string' ? values['baseline-dir'] : undefined,
				failOnDrift: values['fail-on-drift'] === true,
				driftSections: typeof values.sections === 'string' ? values.sections : undefined,
				workers:
					typeof values.workers === 'string' ? Number.parseInt(values.workers, 10) : undefined,
				matrixSection:
					matrixSection &&
					[
						'domain',
						'branding',
						'secrets',
						'identity',
						'token',
						'csrf',
						'supply-chain',
						'service',
						'visual',
						'ops',
						'audit',
						'intel',
						'tls',
						'errors',
					].includes(matrixSection)
						? (matrixSection as import('../domain/field-matrix.ts').DomainFieldSection)
						: undefined,
			});
			return;
		}
		default:
			break;
	}

	console.error(colorize(TERMINAL.scannerFatal, `[sp] unknown command: ${command}`));
	console.error(colorize(TERMINAL.scannerDim, 'Try: bun sp shell | bun sp start --domain <name>'));
	process.exit(1);
}

await runCliIfMain(main, import.meta.path);
