import path from 'path';
import {watch, type FSWatcher} from 'fs';
import {domainRegistry} from '../config/registry.ts';
import {resolveNetworkConfig} from '../network/resolve-config.ts';
import {runNetworkTick} from '../network/tick.ts';
import {createAsyncDebouncer} from '../utils/debounce.ts';
import {onInterruptSignals, waitForInterruptSignal} from '../utils/signals.ts';
import {resolveProjectRootFromPath, resolveSupplyChainScanPath} from './supply-chain-path.ts';
import {resolveSupplyChainWatchPaths} from './supply-chain-watch.ts';

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
	noColor?: boolean;
	failOnHealth?: boolean;
	failOnDrift?: boolean;
}

export async function runSupplyChainNetworkLoop(
	options: SupplyChainNetworkLoopOptions,
): Promise<number> {
	const bundlePath = resolveSupplyChainScanPath(options.path);
	const projectRoot =
		options.projectRoot ?? resolveProjectRootFromPath(bundlePath) ?? process.cwd();
	const domain = options.domain ?? 'external.project';

	let config = null;
	if (options.domain) {
		try {
			await domainRegistry.ensureDomain(options.domain);
			config = domainRegistry.get(options.domain);
		} catch {
			config = null;
		}
	}

	const resolved = resolveNetworkConfig({
		domain,
		projectRoot,
		network: config?.service?.network,
		domainConfig: config,
		distPathOverride: bundlePath,
		overrides: {
			healthUrl: options.healthUrl,
			healthUrlSecret: options.healthUrlSecret,
			baseline: options.baseline,
			updateBaseline: options.updateBaseline,
			failOnHealth: options.failOnHealth,
			failOnDrift: options.failOnDrift,
			json: options.json,
			herdrTab: options.herdrTab,
			noColor: options.noColor,
			watch: options.watch,
			debounceMs: options.debounceMs,
		},
	});

	const tickOptions = {
		domainId: domain,
		projectRoot,
		distPath: resolved.resolvedDistPath,
		healthUrl: resolved.healthUrl,
		healthUrlSecret: resolved.healthUrlSecret,
		baselinePath: resolved.resolvedBaselinePath,
		updateBaseline: resolved.updateBaseline,
		failOnHealth: resolved.failOnHealth,
		failOnDrift: resolved.failOnDrift,
		emitJson: resolved.json,
		emitHerdrTab: resolved.herdrTab,
		noColor: resolved.noColor,
		domainConfig: config,
		scanPatterns: async () => [],
		checkPackageVersions: async () => [],
	};

	const first = await runNetworkTick({...tickOptions, phase: 'initial'});
	if (!options.watch) {
		return first.exitCode;
	}

	let scanning = false;
	const debounceMs = resolved.debounceMs;
	let lastTrigger: string | undefined;
	const onChange = createAsyncDebouncer(async () => {
		if (scanning) return;
		scanning = true;
		try {
			await runNetworkTick({
				...tickOptions,
				phase: 'watch',
				trigger: lastTrigger,
			});
		} finally {
			scanning = false;
		}
	}, debounceMs);

	const watched = resolveSupplyChainWatchPaths({
		path: options.path,
		projectRoot: options.projectRoot,
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
