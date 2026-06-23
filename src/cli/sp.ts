#!/usr/bin/env bun
import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import {domainRegistry} from '../config/registry.ts';
import {runQrCli} from './qr.ts';
import {runTlsCli} from './tls.ts';
import {runConfigDoctor} from './config-doctor.ts';
import {SecurityShell} from '../interactive/index.ts';
import {runCliIfMain} from '../utils/cli.ts';
import {exitIfNotInteractive, spawnInheritAndExit} from '../utils/process.ts';

const HELP = `Usage:
  bun sp [shell] [--domain <reverse-dns-domain>]
  bun sp start --domain <reverse-dns-domain> [--port N] [--http3] [--no-http1] [--watch]
  bun sp audit thumbnail --id <audit-id> --input <image> --domain <domain>
  bun sp qr --domain <name> [--terminal] [--format svg|png|webp] [--out path] [--size N] [--dark #hex] [--light #hex]
  bun sp qr --text <value> --out <path>
  bun sp report --image --html <path> [--out <path>]
  bun sp tls --domain <name> --host <hostname> [--use-system-ca|--no-use-system-ca] [--deep] [--port 443] [--json]
  bun sp doctor [--snapshot] [--update-snapshots|-u] [--matrix] [--branding] [--matrix-section <name>] [--json] [--root <path>]
  bun sp doctor --json | fx    # piped pagers work on Bun >= 1.3.14

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

	await new Promise<void>(() => {});
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
			'matrix': {type: 'boolean'},
			'branding': {type: 'boolean'},
			'snapshot': {type: 'boolean'},
			'update-snapshots': {type: 'boolean', short: 'u'},
			'matrix-section': {type: 'string'},
			'host': {type: 'string'},
			'use-system-ca': {type: 'boolean'},
			'deep': {type: 'boolean'},
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
		case 'doctor': {
			const matrixSection =
				typeof values['matrix-section'] === 'string' ? values['matrix-section'] : undefined;
			await runConfigDoctor({
				root: values.root,
				json: values.json === true,
				argv: Bun.argv,
				checkPeerMeta: values['check-peer-meta'] === true,
				matrix: values.matrix === true,
				branding: values.branding === true,
				snapshot: values.snapshot === true || values['update-snapshots'] === true,
				updateSnapshots: values['update-snapshots'] === true,
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

await runCliIfMain(main);
