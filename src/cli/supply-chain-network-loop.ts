import path from 'path';
import {watch, type FSWatcher} from 'fs';
import type {DomainConfig} from '../config/types.ts';
import {domainRegistry} from '../config/registry.ts';
import {auditBundleNetwork} from '../intel/network-audit.ts';
import {
	defaultNetworkBaselinePath,
	diffNetworkBaseline,
	formatNetworkBaselineDelta,
	loadNetworkBaseline,
	saveNetworkBaseline,
	type NetworkBaselineDelta,
	type NetworkBaselineDocument,
	NETWORK_BASELINE_VERSION,
} from '../intel/network-baseline.ts';
import {probeNetworkHealth, resolveHealthUrl} from '../intel/network-health.ts';
import {createAsyncDebouncer} from '../utils/debounce.ts';
import {onInterruptSignals, waitForInterruptSignal} from '../utils/signals.ts';
import {resolveProjectRootFromPath, resolveSupplyChainScanPath} from './supply-chain-path.ts';
import {resolveSupplyChainWatchPaths} from './supply-chain-watch.ts';
import {
	formatNetworkLoopStatusLine,
	resolveNetworkLoopColors,
} from './supply-chain-network-colors.ts';
import {
	buildHerdrDoctorTabDocument,
	formatHerdrDoctorTabText,
} from './supply-chain-network-herdr.ts';

export interface SupplyChainNetworkLoopOptions {
	path: string;
	domain?: string;
	projectRoot?: string;
	healthUrl?: string;
	healthUrlSecret?: string;
	baseline?: string;
	updateBaseline?: boolean;
	watch?: boolean;
	debounceMs?: number;
	json?: boolean;
	herdrTab?: boolean;
	failOnHealth?: boolean;
	failOnDrift?: boolean;
}

export interface NetworkLoopTickResult {
	exitCode: number;
	audit: Awaited<ReturnType<typeof auditBundleNetwork>>;
	health: Awaited<ReturnType<typeof probeNetworkHealth>>;
	delta?: NetworkBaselineDelta;
	baselinePath: string;
}

async function resolveDomainConfig(domain?: string): Promise<DomainConfig | null> {
	if (!domain) return null;
	try {
		await domainRegistry.loadAll();
		if (!domainRegistry.has(domain)) return null;
		return domainRegistry.get(domain);
	} catch {
		return null;
	}
}

function resolveBaselinePath(
	options: SupplyChainNetworkLoopOptions,
	domain: string,
	projectRoot: string,
): string {
	if (options.baseline) {
		return path.resolve(options.baseline);
	}
	return defaultNetworkBaselinePath(domain, projectRoot);
}

export async function runNetworkLoopTick(
	options: SupplyChainNetworkLoopOptions,
	phase: 'initial' | 'watch' | 'tick',
	trigger?: string,
): Promise<NetworkLoopTickResult> {
	const bundlePath = resolveSupplyChainScanPath(options.path);
	const projectRoot =
		options.projectRoot ?? resolveProjectRootFromPath(bundlePath) ?? process.cwd();
	const domain = options.domain ?? 'external.project';
	const config = await resolveDomainConfig(options.domain);
	const colors = resolveNetworkLoopColors(config);

	const audit = await auditBundleNetwork(bundlePath);
	const healthResolution = await resolveHealthUrl({
		healthUrl: options.healthUrl,
		healthUrlSecret: options.healthUrlSecret,
		domainService: config?.secrets.service,
	});
	const health = await probeNetworkHealth({
		healthUrl: healthResolution.url,
		extraUrls: audit.healthRoutes
			.filter(route => route.startsWith('http'))
			.slice(0, 3),
	});

	const baselinePath = resolveBaselinePath(options, domain, projectRoot);
	const baseline = await loadNetworkBaseline(baselinePath);
	let delta: NetworkBaselineDelta | undefined;
	if (baseline) {
		delta = diffNetworkBaseline(baseline, {
			endpoints: audit.endpoints,
			healthRoutes: audit.healthRoutes,
			health: health.status,
		});
	}

	if (options.updateBaseline) {
		const document: NetworkBaselineDocument = {
			version: NETWORK_BASELINE_VERSION,
			domain,
			capturedAt: new Date().toISOString(),
			bundlePath,
			endpoints: audit.endpoints,
			healthRoutes: audit.healthRoutes,
			health: health.status,
		};
		await saveNetworkBaseline(baselinePath, document);
	}

	const deltaLine =
		delta && phase !== 'initial'
			? formatNetworkBaselineDelta(delta, trigger)
			: undefined;

	if (options.json) {
		const payload = {
			phase,
			bundlePath,
			domain,
			network: {
				unique: audit.unique,
				raw: audit.raw,
				endpoints: audit.endpoints,
				healthRoutes: audit.healthRoutes,
			},
			health: {
				status: health.status,
				probesOk: health.probesOk,
				probesTotal: health.probesTotal,
				latencyMs: health.latencyMs,
				urlSource: healthResolution.source,
			},
			baseline: baselinePath,
			delta,
		};
		console.log(JSON.stringify(payload, null, 2));
	} else if (options.herdrTab) {
		const tab = buildHerdrDoctorTabDocument({
			domain: options.domain,
			phase,
			networkUnique: audit.unique,
			networkRaw: audit.raw,
			endpoints: audit.endpoints.length,
			healthRoutes: audit.healthRoutes.length,
			health: health.status,
			probesOk: health.probesOk,
			probesTotal: health.probesTotal,
			latencyMs: health.latencyMs,
			delta,
			bundlePath,
		});
		console.log(formatHerdrDoctorTabText(tab));
	} else {
		console.error(
			formatNetworkLoopStatusLine(
				{
					phase,
					networkUnique: audit.unique,
					networkRaw: audit.raw,
					endpoints: audit.endpoints.length,
					healthRoutes: audit.healthRoutes.length,
					health: health.status,
					probesOk: health.probesOk,
					probesTotal: health.probesTotal,
					latencyMs: health.latencyMs,
					deltaLine,
				},
				colors,
			),
		);
	}

	let exitCode = 0;
	if (options.failOnHealth && health.status !== 'healthy' && health.status !== 'unknown') {
		exitCode = 1;
	}
	if (options.failOnDrift && delta?.hasEndpointDrift) {
		exitCode = 1;
	}

	return {exitCode, audit, health, delta, baselinePath};
}

export async function runSupplyChainNetworkLoop(
	options: SupplyChainNetworkLoopOptions,
): Promise<number> {
	const first = await runNetworkLoopTick(options, 'initial');
	if (!options.watch) {
		return first.exitCode;
	}

	let scanning = false;
	const debounceMs = options.debounceMs ?? 500;
	let lastTrigger: string | undefined;
	const onChange = createAsyncDebouncer(async () => {
		if (scanning) return;
		scanning = true;
		try {
			await runNetworkLoopTick(options, 'watch', lastTrigger);
		} finally {
			scanning = false;
		}
	}, debounceMs);

	const watched = resolveSupplyChainWatchPaths({
		path: options.path,
		projectRoot: options.projectRoot,
		policyPath: undefined,
	});
	const watchers: FSWatcher[] = [];
	for (const filePath of watched) {
		try {
			const watcher = watch(filePath, event => {
				if (event === 'change') {
					lastTrigger = path.basename(filePath);
					onChange();
				}
			});
			watchers.push(watcher);
		} catch {
			/* skip */
		}
	}

	console.error(`[loop] watch ${watchers.length} path(s) — Ctrl+C to stop`);
	const shutdown = () => {
		for (const w of watchers) {
			try {
				w.close();
			} catch {
				/* ignore */
			}
		}
	};
	const disposeSignals = onInterruptSignals(shutdown);
	try {
		await waitForInterruptSignal();
	} finally {
		shutdown();
		disposeSignals();
	}
	return first.exitCode;
}