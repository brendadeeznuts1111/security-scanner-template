#!/usr/bin/env bun
/**
 * Workflow loop CLI (`sp workflow run|start|status`).
 *
 * @see https://github.com/oven-sh/bun/blob/main/docs/runtime/watch.mdx
 * @see https://github.com/Effect-TS/effect/blob/main/packages/platform/src/Command.ts
 */
import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import {domainRegistry, type DomainRegistry} from '../config/registry.ts';
import {WorkflowLoop} from '../workflow/loop.ts';
import {WORKFLOW_SCANNER_IDS} from '../workflow/scanners.ts';
import type {WorkflowLoopOptions, WorkflowOutputFormat} from '../workflow/types.ts';
import {cliBoolean, cliString, runCliIfMain} from '../utils/cli.ts';

export interface WorkflowCliOptions {
	command: 'run' | 'start' | 'status';
	domain: string;
	scanners?: string[];
	interval?: number;
	watch?: boolean;
	output?: WorkflowOutputFormat;
	dryRun?: boolean;
	failOnIssue?: boolean;
	failOnSeverity?: WorkflowLoopOptions['failOnSeverity'];
	tlsHost?: string;
	tlsPort?: number;
	tlsDeep?: boolean;
	seedPath?: string;
	seedWritePath?: string;
	failOnDrift?: boolean;
	json?: boolean;
	registry?: DomainRegistry;
}

const OUTPUT_FORMATS: WorkflowOutputFormat[] = ['table', 'json', 'ndjson', 'herdr'];

function parseScanners(value: string | undefined): string[] | undefined {
	if (!value) return undefined;
	return value
		.split(',')
		.map(entry => entry.trim())
		.filter(entry => entry.length > 0);
}

export async function runWorkflowCli(options: WorkflowCliOptions): Promise<number> {
	const registry = options.registry ?? domainRegistry;
	await registry.ensureDomain(options.domain);
	const domainConfig = registry.get(options.domain);
	const workflowConfig = domainConfig.service?.workflow;

	const output: WorkflowOutputFormat = options.json === true ? 'json' : (options.output ?? 'table');
	if (!OUTPUT_FORMATS.includes(output)) {
		console.error(colorize(TERMINAL.scannerFatal, `[workflow] invalid --output ${output}`));
		return 1;
	}

	const scanners = options.scanners;
	for (const id of scanners ?? []) {
		if (!WORKFLOW_SCANNER_IDS.includes(id as (typeof WORKFLOW_SCANNER_IDS)[number])) {
			console.error(colorize(TERMINAL.scannerFatal, `[workflow] unknown scanner "${id}"`));
			return 1;
		}
	}

	const loop = new WorkflowLoop(options.domain, registry, {
		scanners,
		interval: options.interval,
		watch: options.watch,
		output,
		dryRun: options.command === 'run' || options.dryRun === true,
		failOnIssue: options.failOnIssue,
		failOnSeverity: options.failOnSeverity,
		tlsHost: options.tlsHost,
		tlsPort: options.tlsPort,
		tlsDeep: options.tlsDeep,
		seedPath: options.seedPath ?? workflowConfig?.seedPath,
		seedWritePath: options.seedWritePath ?? workflowConfig?.seedWritePath,
		failOnDrift: options.failOnDrift ?? workflowConfig?.failOnDrift,
	});

	if (options.command === 'status') {
		const status = loop.status();
		if (options.json) {
			console.log(JSON.stringify(status, null, 2));
		} else {
			console.log(
				`workflow ${status.domain}: running=${status.running} runs=${status.runCount} scanners=${status.scanners.join(',')}`,
			);
		}
		return 0;
	}

	if (options.command === 'run') {
		await loop.loadSeed();
		const report = await loop.runAll();
		return loop.exitCode(report);
	}

	await loop.start();
	return loop.exitCode();
}

async function main(): Promise<void> {
	const parsed = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			'domain': {type: 'string', short: 'd'},
			'scanners': {type: 'string', short: 's'},
			'interval': {type: 'string', short: 'i'},
			'output': {type: 'string', short: 'o'},
			'fail-on-severity': {type: 'string'},
			'tls-host': {type: 'string'},
			'tls-port': {type: 'string'},
			'watch': {type: 'boolean'},
			'dry-run': {type: 'boolean'},
			'fail-on-issue': {type: 'boolean'},
			'fail-on-drift': {type: 'boolean'},
			'seed': {type: 'string'},
			'seed-write': {type: 'string'},
			'tls-deep': {type: 'boolean'},
			'json': {type: 'boolean'},
			'help': {type: 'boolean', short: 'h'},
		},
		allowPositionals: true,
		strict: false,
	});

	if (parsed.values.help) {
		console.log(`Usage:
  bun sp workflow run --domain <name> [--scanners network,semver,patterns,tls,dns] [--output table|json|ndjson|herdr] [--dry-run] [--fail-on-issue] [--fail-on-severity high]
      [--seed <path>] [--seed-write <path>] [--fail-on-drift]
  bun sp workflow start --domain <name> [--interval 60000] [--watch] [--scanners ...] [--output ndjson] [--seed <path>] [--fail-on-drift]
  bun sp workflow status --domain <name> [--json]

Scanners: ${WORKFLOW_SCANNER_IDS.join(', ')}`);
		process.exit(0);
	}

	const command = (parsed.positionals[0] ?? 'run') as WorkflowCliOptions['command'];
	if (command !== 'run' && command !== 'start' && command !== 'status') {
		console.error(colorize(TERMINAL.scannerFatal, `[workflow] unknown command "${command}"`));
		process.exit(1);
	}

	const domain = cliString(parsed.values.domain);
	if (!domain) {
		console.error(colorize(TERMINAL.scannerFatal, '[workflow] --domain is required'));
		process.exit(1);
	}

	const exitCode = await runWorkflowCli({
		command,
		domain,
		scanners: parseScanners(cliString(parsed.values.scanners)),
		interval: cliString(parsed.values.interval)
			? Number.parseInt(cliString(parsed.values.interval)!, 10)
			: undefined,
		watch: cliBoolean(parsed.values.watch),
		output: cliString(parsed.values.output) as WorkflowOutputFormat | undefined,
		dryRun: cliBoolean(parsed.values['dry-run']),
		failOnIssue: cliBoolean(parsed.values['fail-on-issue']),
		failOnDrift: cliBoolean(parsed.values['fail-on-drift']),
		seedPath: cliString(parsed.values.seed),
		seedWritePath: cliString(parsed.values['seed-write']),
		failOnSeverity: cliString(parsed.values['fail-on-severity']) as
			| WorkflowLoopOptions['failOnSeverity']
			| undefined,
		tlsHost: cliString(parsed.values['tls-host']),
		tlsPort: cliString(parsed.values['tls-port'])
			? Number.parseInt(cliString(parsed.values['tls-port'])!, 10)
			: undefined,
		tlsDeep: cliBoolean(parsed.values['tls-deep']),
		json: cliBoolean(parsed.values.json),
	});

	process.exit(exitCode);
}

await runCliIfMain(main, import.meta.path);
