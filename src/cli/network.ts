/**
 * Network monitor CLI (`sp network start|stop|status`).
 *
 * @see https://github.com/oven-sh/bun/blob/main/docs/runtime/watch.mdx
 * @see https://github.com/Effect-TS/effect/blob/main/packages/effect/src/Schedule.ts
 */
import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import type {DomainRegistry} from '../config/registry.ts';
import {domainRegistry} from '../config/registry.ts';
import {defaultNetworkBaselinePath} from '../intel/network-baseline.ts';
import {NetworkDriftFailure, NetworkHealthFailure} from '../network/loop.ts';
import {resolveNetworkConfig, type NetworkConfigOverrides} from '../network/resolve-config.ts';
import {Service} from '../service/index.ts';
import {runCliIfMain} from '../utils/cli.ts';
import {waitForInterruptSignal} from '../utils/signals.ts';
import {writeJsonStdout} from '../utils/process.ts';

export interface NetworkCliOverrides extends NetworkConfigOverrides {
	all?: boolean;
}

export interface NetworkCliOptions extends NetworkCliOverrides {
	domain?: string;
	command: 'start' | 'stop' | 'status';
	registry?: DomainRegistry;
}

function networkOverridesFromCli(options: NetworkCliOptions): NetworkConfigOverrides {
	return {
		healthUrl: options.healthUrl,
		healthUrlSecret: options.healthUrlSecret,
		baseline: options.baseline,
		updateBaseline: options.updateBaseline,
		failOnHealth: options.failOnHealth,
		failOnDrift: options.failOnDrift,
		json: options.json,
		herdrTab: options.herdrTab,
		noColor: options.noColor,
	};
}

async function resolveService(domain: string, registry: DomainRegistry): Promise<Service> {
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

function listNetworkDomains(registry: DomainRegistry): string[] {
	return registry.list().filter(domain => {
		try {
			return registry.get(domain).service?.network?.enabled === true;
		} catch {
			return false;
		}
	});
}

export async function runNetworkCli(options: NetworkCliOptions): Promise<number> {
	const registry = options.registry ?? domainRegistry;

	try {
		switch (options.command) {
			case 'start': {
				await registry.loadAll();

				if (options.all) {
					const domains = listNetworkDomains(registry);
					if (domains.length === 0) {
						console.error(
							colorize(
								TERMINAL.scannerWarn,
								'[sp network] no domains with service.network.enabled',
							),
						);
						return 1;
					}
					let maxExit = 0;
					const services: Service[] = [];
					for (const domain of domains) {
						const service = await resolveService(domain, registry);
						await service.startNetworkMonitor({
							networkOverrides: networkOverridesFromCli(options),
							onHealthFailure: () => {
								maxExit = 1;
							},
							onDriftFailure: () => {
								maxExit = 1;
							},
						});
						services.push(service);
						console.error(colorize(TERMINAL.scannerOk, `[sp network] started ${domain}`));
					}
					console.error(colorize(TERMINAL.scannerDim, '[sp network] press Ctrl+C to stop'));
					await waitForInterruptSignal();
					for (const service of services) {
						service.stopNetworkMonitor();
						service.close();
					}
					return maxExit;
				}

				if (!options.domain) {
					throw new Error('--domain is required (or use --all)');
				}

				const service = await resolveService(options.domain, registry);
				const config = registry.get(options.domain);
				const resolved = resolveNetworkConfig({
					domain: options.domain,
					projectRoot: registry.root,
					network: config.service?.network,
					domainConfig: config,
					overrides: networkOverridesFromCli(options),
				});
				const status = await service.startNetworkMonitor({
					networkOverrides: networkOverridesFromCli(options),
					onHealthFailure: () => process.exit(1),
					onDriftFailure: () => process.exit(1),
				});

				if (resolved.json) {
					writeJsonStdout({ok: true, action: 'start', status});
				} else {
					console.error(
						colorize(
							TERMINAL.scannerOk,
							`[sp network] started monitor for ${options.domain} (dist=${status.distPath})`,
						),
					);
					console.error(colorize(TERMINAL.scannerDim, '[sp network] press Ctrl+C to stop'));
				}

				const exitOnStart = service.lastNetworkExit();
				if (exitOnStart !== 0) {
					service.stopNetworkMonitor();
					service.close();
					return exitOnStart;
				}

				await waitForInterruptSignal();
				service.stopNetworkMonitor();
				service.close();
				return 0;
			}
			case 'stop': {
				if (!options.domain) {
					throw new Error('--domain is required');
				}
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
				if (!options.domain) {
					throw new Error('--domain is required');
				}
				const service = await resolveService(options.domain, registry);
				await service.initialize();
				const status = service.networkMonitorStatus();
				const baseline =
					status.baselinePath ?? defaultNetworkBaselinePath(options.domain, registry.root);
				if (options.json) {
					writeJsonStdout({...status, baselinePath: baseline});
				} else {
					console.log(
						[
							`domain: ${status.domain}`,
							`running: ${status.running}`,
							`dist: ${status.distPath}`,
							`baseline: ${baseline}`,
							`health: ${status.healthUrl ?? status.healthUrlSecret ?? '(none)'}`,
							`probeIntervalMs: ${status.probeIntervalMs}`,
							`watch: ${status.watchEnabled}`,
							`failOnHealth: ${status.failOnHealth}`,
							`failOnDrift: ${status.failOnDrift}`,
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
		if (error instanceof NetworkDriftFailure) {
			console.error(
				colorize(
					TERMINAL.scannerFatal,
					`[sp network] baseline drift: +${error.delta.endpoints.added.length}/-${error.delta.endpoints.removed.length} endpoints`,
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
			'domain': {type: 'string'},
			'health-url': {type: 'string'},
			'health-url-secret': {type: 'string'},
			'baseline': {type: 'string'},
			'update-baseline': {type: 'boolean'},
			'fail-on-health': {type: 'boolean'},
			'fail-on-drift': {type: 'boolean'},
			'json': {type: 'boolean'},
			'herdr-tab': {type: 'boolean'},
			'no-color': {type: 'boolean'},
			'all': {type: 'boolean'},
			'help': {type: 'boolean', short: 'h'},
		},
		allowPositionals: true,
	});

	if (values.help || positionals[0] === 'help') {
		console.log(`Usage:
  bun sp network start --domain <reverse-dns-domain> [options]
  bun sp network start --all
  bun sp network stop --domain <reverse-dns-domain>
  bun sp network status --domain <reverse-dns-domain> [--json]

Options (override domain config):
  --health-url              Literal health probe URL
  --health-url-secret       Bun.secrets name (supply-chain-{domain} service)
  --baseline                Baseline JSON5 path
  --update-baseline         Capture current state as baseline
  --fail-on-health          Exit 1 on degraded/unreachable health
  --fail-on-drift           Exit 1 when endpoints drift from baseline
  --json                    NDJSON ticks on stdout
  --herdr-tab               herdr-doctor tab layout on stdout
  --no-color                Plain stderr dashboard
  --all                     Start monitors for all network.enabled domains

Requires service.network.enabled in domain config.`);
		process.exit(0);
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
		}),
	);
}

await runCliIfMain(main, import.meta.path);
