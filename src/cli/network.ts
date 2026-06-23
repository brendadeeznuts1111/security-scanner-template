import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import type {DomainRegistry} from '../config/registry.ts';
import {domainRegistry} from '../config/registry.ts';
import {NetworkHealthFailure} from '../network/loop.ts';
import {Service} from '../service/index.ts';
import {runCliIfMain} from '../utils/cli.ts';
import {waitForInterruptSignal} from '../utils/signals.ts';
import {writeJsonStdout} from '../utils/process.ts';

export interface NetworkCliOptions {
	domain: string;
	command: 'start' | 'stop' | 'status';
	json?: boolean;
	registry?: DomainRegistry;
}

async function resolveService(
	domain: string,
	registry: DomainRegistry,
): Promise<Service> {
	await registry.ensureDomain(domain);
	if (!registry.has(domain)) {
		throw new Error(`Unknown domain: ${domain}`);
	}
	const config = registry.get(domain);
	if (!config.service?.network?.enabled) {
		throw new Error(
			`Network monitor disabled for ${domain}; set service.network.enabled: true in domain config`,
		);
	}
	return registry.service(domain);
}

export async function runNetworkCli(options: NetworkCliOptions): Promise<number> {
	const registry = options.registry ?? domainRegistry;

	try {
		switch (options.command) {
			case 'start': {
				const service = await resolveService(options.domain, registry);
				const status = await service.startNetworkMonitor({
					onHealthFailure: () => process.exit(1),
				});
				if (options.json) {
					writeJsonStdout({ok: true, action: 'start', status});
				} else {
					console.error(
						colorize(
							TERMINAL.scannerOk,
							`[sp network] started monitor for ${options.domain} (dist=${status.distPath})`,
						),
					);
				}
				console.error(colorize(TERMINAL.scannerDim, '[sp network] press Ctrl+C to stop'));
				await waitForInterruptSignal();
				service.stopNetworkMonitor();
				service.close();
				return 0;
			}
			case 'stop': {
				const service = await resolveService(options.domain, registry);
				await service.initialize();
				service.stopNetworkMonitor();
				service.close();
				if (options.json) {
					writeJsonStdout({ok: true, action: 'stop', domain: options.domain});
				} else {
					console.error(
						colorize(TERMINAL.scannerOk, `[sp network] stopped monitor for ${options.domain}`),
					);
				}
				return 0;
			}
			case 'status': {
				const service = await resolveService(options.domain, registry);
				await service.initialize();
				const status = service.networkMonitorStatus();
				if (options.json) {
					writeJsonStdout(status);
				} else {
					console.log(
						[
							`domain: ${status.domain}`,
							`running: ${status.running}`,
							`dist: ${status.distPath}`,
							`health: ${status.healthUrl ?? '(none)'}`,
							`probeIntervalMs: ${status.probeIntervalMs}`,
							`watch: ${status.watchEnabled}`,
							`audits: ${status.auditCount}`,
							`probes: ${status.probeCount}`,
							status.lastAuditAt ? `lastAudit: ${status.lastAuditAt}` : null,
						]
							.filter(Boolean)
							.join('\n'),
					);
				}
				service.close();
				return 0;
			}
			default:
				return 1;
		}
	} catch (error) {
		if (error instanceof NetworkHealthFailure) {
			console.error(
				colorize(
					TERMINAL.scannerFatal,
					`[sp network] health check failed: ${error.result.status} (${error.result.latencyMs}ms)`,
				),
			);
			return 1;
		}
		console.error(
			colorize(
				TERMINAL.scannerFatal,
				`[sp network] ${error instanceof Error ? error.message : String(error)}`,
			),
		);
		return 1;
	}
}

async function main(): Promise<void> {
	const {values, positionals} = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			domain: {type: 'string'},
			json: {type: 'boolean'},
			help: {type: 'boolean', short: 'h'},
		},
		allowPositionals: true,
	});

	if (values.help || positionals[0] === 'help') {
		console.log(`Usage:
  bun sp network start --domain <reverse-dns-domain> [--json]
  bun sp network stop --domain <reverse-dns-domain> [--json]
  bun sp network status --domain <reverse-dns-domain> [--json]

Requires service.network.enabled in the domain config.`);
		process.exit(0);
	}

	const domain = values.domain;
	if (!domain) {
		console.error(colorize(TERMINAL.scannerFatal, '[sp network] --domain is required'));
		process.exit(1);
	}

	const subcommand = positionals[0];
	if (subcommand !== 'start' && subcommand !== 'stop' && subcommand !== 'status') {
		console.error(
			colorize(TERMINAL.scannerFatal, `[sp network] unknown command: ${subcommand ?? '(none)'}`),
		);
		process.exit(1);
	}

	process.exit(
		await runNetworkCli({
			domain,
			command: subcommand,
			json: values.json === true,
		}),
	);
}

await runCliIfMain(main, import.meta.path);