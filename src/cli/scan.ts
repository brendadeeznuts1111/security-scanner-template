import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import {domainRegistry} from '../config/registry.ts';
import {loadAllDomains} from '../config/loader.ts';
import {Service} from '../service/index.ts';
import {checkDomainsParallel} from '../scan/domain-parallel.ts';
import {DEFAULT_SECURITY_TOOLS} from '../scan/tools.ts';
import {findingsToAdvisories, scanSource as scanSourceCode} from '../scan/transpiler.ts';
import {runTranspilerBundleCli} from './transpiler-bundle.ts';
import {runScanPackagesCli} from './scan-packages.ts';
import {runScanPatternsCli} from './scan-patterns.ts';
import {runScanConstraintsCli} from './scan-constraints.ts';
import {runTlsCli} from './tls.ts';
import {runCliIfMain} from '../utils/cli.ts';
import {benchmark} from '../utils/benchmark.ts';
import {exitIfNotInteractive} from '../utils/process.ts';

async function runInteractiveScan(domain: string, tool: string, args: string[]): Promise<void> {
	exitIfNotInteractive('bun run scan interactive');
	await domainRegistry.loadAll();

	if (!domainRegistry.has(domain)) {
		console.error(colorize(TERMINAL.scannerFatal, `[scan] unknown domain: ${domain}`));
		process.exit(1);
	}

	const config = domainRegistry.get(domain);
	if (!config.service?.interactive) {
		console.error(
			colorize(
				TERMINAL.scannerFatal,
				`[scan] interactive mode is disabled for ${domain}; set service.interactive: true`,
			),
		);
		process.exit(1);
	}

	const service = new Service(domainRegistry, domain);
	const result = await service.runInteractiveScanner(tool, args);
	process.exit(result.exitCode === 0 ? 0 : 1);
}

async function runSourceScan(sourcePath: string, json: boolean): Promise<void> {
	const source = await Bun.file(sourcePath).text();
	const findings = scanSourceCode(source);
	const advisories = findingsToAdvisories('inline-source', '0.0.0', findings);

	if (json) {
		console.log(JSON.stringify({findings, advisories}, null, 2));
		process.exit(findings.some(f => f.severity === 'fatal') ? 1 : 0);
	}

	console.error(
		colorize(TERMINAL.scannerInfo, `[scan] ${sourcePath} — ${findings.length} finding(s)`),
	);
	for (const finding of findings) {
		const color = finding.severity === 'fatal' ? TERMINAL.scannerFatal : TERMINAL.scannerWarn;
		console.error(colorize(color, `  ${finding.severity} ${finding.id}: ${finding.description}`));
	}
	process.exit(findings.some(f => f.severity === 'fatal') ? 1 : 0);
}

async function runDomainsScan(root: string, json: boolean, workers?: number): Promise<void> {
	const loaded = await loadAllDomains(root);
	const timed = await benchmark('scan.domains', () =>
		checkDomainsParallel(loaded, {enabled: true, workerCount: workers}),
	);

	const results = timed.result;
	const errors = results.reduce(
		(sum, r) => sum + r.issues.filter(i => i.severity === 'error').length,
		0,
	);
	const warnings = results.reduce(
		(sum, r) => sum + r.issues.filter(i => i.severity === 'warning').length,
		0,
	);

	if (json) {
		console.log(
			JSON.stringify({domains: results, errors, warnings, durationMs: timed.durationMs}, null, 2),
		);
		process.exit(errors > 0 ? 1 : 0);
	}

	console.error(
		colorize(
			TERMINAL.scannerInfo,
			`[scan] ${results.length} domain(s) in ${timed.durationMs.toFixed(2)}ms — ${errors} error(s), ${warnings} warning(s)`,
		),
	);

	for (const result of results) {
		const mark = result.ok
			? colorize(TERMINAL.scannerOk, '✓')
			: colorize(TERMINAL.scannerFatal, '✗');
		console.error(`${mark} ${result.domain}`);
		for (const issue of result.issues) {
			console.error(`    ${issue.severity} ${issue.field}: ${issue.message}`);
		}
	}

	process.exit(errors > 0 ? 1 : 0);
}

async function main(): Promise<void> {
	const {values, positionals} = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			'domain': {type: 'string'},
			'host': {type: 'string'},
			'port': {type: 'string'},
			'tool': {type: 'string'},
			'root': {type: 'string'},
			'path': {type: 'string'},
			'rules': {type: 'string'},
			'format': {type: 'string'},
			'output': {type: 'string'},
			'verify-integrity': {type: 'boolean'},
			'update-snapshot': {type: 'boolean'},
			'fail-on-bundle-drift': {type: 'boolean'},
			'baseline-dir': {type: 'string'},
			'workers': {type: 'string'},
			'use-system-ca': {type: 'boolean'},
			'deep': {type: 'boolean'},
			'json': {type: 'boolean'},
			'markdown': {type: 'boolean'},
			'html': {type: 'boolean'},
			'threat-feed': {type: 'boolean'},
			'feed-url': {type: 'string'},
			'fix': {type: 'boolean'},
			'transitive': {type: 'boolean'},
			'probe': {type: 'boolean'},
			'imports': {type: 'boolean'},
			'no-imports': {type: 'boolean'},
			'help': {type: 'boolean', short: 'h'},
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(`Usage:
  bun run scan interactive --domain <domain> [--tool <name>] [-- <scanner-args...>]
  bun run scan bundle [--path <dir|file>] [--domain <name>] [--rules id,id] [--format json|markdown|html] [--output path] [--verify-integrity] [--json|--markdown|--html]
  bun run scan source --domain <reverse-dns> [--path src/] [--root <cwd>] [--fix] [--json]
  bun run scan source <file> [--json]
  bun run scan domains [--root <cwd>] [--workers <n>] [--json]
  bun run scan packages --domain <reverse-dns> [--root <cwd>] [--deep] [--probe] [--transitive] [--path src/] [--threat-feed] [--feed-url <url>] [--fix] [--json]
  bun run scan constraints --domain <reverse-dns> [--root <cwd>] [--path src/] [--transitive] [--no-imports] [--fix] [--json]
  bun run scan tls --host <hostname> [--domain <reverse-dns>] [--use-system-ca|--no-use-system-ca] [--deep] [--json]

Subcommands:
  interactive  External scanner via Bun.Terminal PTY (TTY required; service.interactive)
  bundle       Scan bun build output for injected threats (Bun.Transpiler)
  source       Scan source tree via policy patterns, or a single file via transpiler
  domains      Parallel domain config validation via Workers
  packages     Check installed deps against [[semver.rule]] in security.policy.toml
  constraints  Deep allow/block/require, license, source, and import constraints
  tls          Remote TLS handshake + OS trust validation (auto when available)

Default tools: ${DEFAULT_SECURITY_TOOLS.join(', ')}`);
		process.exit(0);
	}

	const command = positionals[0];
	const dashIndex = Bun.argv.indexOf('--');
	const scannerArgs =
		dashIndex >= 0
			? Bun.argv.slice(dashIndex + 1)
			: positionals.slice(1).filter(arg => arg !== '--');

	switch (command) {
		case 'interactive': {
			const domain = values.domain;
			if (!domain) {
				console.error(colorize(TERMINAL.scannerFatal, '[scan] --domain is required'));
				process.exit(1);
			}
			const tool = values.tool ?? 'trivy';
			await runInteractiveScan(domain, tool, scannerArgs);
			return;
		}
		case 'bundle': {
			const bundlePath = values.path ?? positionals[1];
			if (!bundlePath) {
				console.error(
					colorize(TERMINAL.scannerFatal, '[scan] bundle path is required (--path or positional)'),
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
				domain: values.domain,
				rules,
				format,
				output: values.output,
				verifyIntegrity: values['verify-integrity'] === true,
				updateSnapshot: values['update-snapshot'] === true,
				failOnBundleDrift: values['fail-on-bundle-drift'] === true,
				baselineDir:
					typeof values['baseline-dir'] === 'string' ? values['baseline-dir'] : undefined,
				json: values.json === true,
				markdown: values.markdown === true,
				html: values.html === true,
				registry: domainRegistry,
			});
			process.exit(exitCode);
		}
		case 'source': {
			if (values.domain) {
				const exitCode = await runScanPatternsCli({
					domain: values.domain,
					path: values.path,
					root: values.root,
					json: values.json === true,
					fix: values.fix === true,
					registry: domainRegistry,
				});
				process.exit(exitCode);
			}

			const sourcePath = positionals[1] ?? values.path;
			if (!sourcePath) {
				console.error(
					colorize(
						TERMINAL.scannerFatal,
						'[scan] source requires --domain <name> [--path dir] or a file path',
					),
				);
				process.exit(1);
			}
			await runSourceScan(sourcePath, values.json === true);
			return;
		}
		case 'domains': {
			const workers = values.workers ? Number.parseInt(values.workers, 10) : undefined;
			await runDomainsScan(values.root ?? process.cwd(), values.json === true, workers);
			return;
		}
		case 'packages': {
			const domain = values.domain;
			if (!domain) {
				console.error(colorize(TERMINAL.scannerFatal, '[scan] packages requires --domain <name>'));
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
			});
			process.exit(exitCode);
		}
		case 'constraints': {
			const domain = values.domain;
			if (!domain) {
				console.error(
					colorize(TERMINAL.scannerFatal, '[scan] constraints requires --domain <name>'),
				);
				process.exit(1);
			}
			const exitCode = await runScanConstraintsCli({
				domain,
				root: values.root,
				path: values.path,
				transitive: values.transitive === true,
				imports: values.imports === true,
				noImports: values['no-imports'] === true,
				json: values.json === true,
				fix: values.fix === true,
			});
			process.exit(exitCode);
		}
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
		default:
			console.error(
				colorize(TERMINAL.scannerFatal, `[scan] unknown command: ${command ?? '(none)'}`),
			);
			process.exit(1);
	}
}

await runCliIfMain(main, import.meta.path);
