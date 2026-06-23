import {watch, type FSWatcher} from 'fs';
import path from 'path';
import {loadDomainReportContext} from '../config/resolve-domain.ts';
import {supplyChainConfigFromDomain} from '../domain/supply-chain-config.ts';
import {loadPackageSnapshot, toSecurityPackage} from '../domains/snapshot.ts';
import * as supplyChain from '../domains/supply-chain.ts';
import type {ReportFormat} from '../report/index.ts';
import {createAsyncDebouncer} from '../utils/debounce.ts';
import {onInterruptSignals, waitForInterruptSignal} from '../utils/signals.ts';
import {createTimer} from '../utils/timing.ts';

export interface WatchOptions {
	report?: ReportFormat;
	output?: string;
	debounceMs?: number;
	feedPath?: string;
}

interface WatchSession {
	watchers: FSWatcher[];
	abort: () => void;
	/** Remove SIGINT/SIGTERM listeners registered by {@link startWatch}. */
	disposeSignals: () => void;
}

export {createDebouncer, createAsyncDebouncer} from '../utils/debounce.ts';

/**
 * Run a single scan of the current project dependencies.
 */
export async function performScan(options: WatchOptions): Promise<void> {
	const timer = createTimer();
	const snapshots = await loadPackageSnapshot();
	if (snapshots.length === 0) {
		console.error('[watch] no packages found in package.json — skipping scan');
		return;
	}

	const domainCtx = await loadDomainReportContext();
	if (domainCtx?.config.supplyChain.enabled) {
		supplyChain.activate(supplyChainConfigFromDomain(domainCtx.config));
	}

	const packages = snapshots.map(toSecurityPackage);
	const advisories = await supplyChain.scanAll(packages);

	const fatalCount = advisories.filter(a => a.level === 'fatal').length;
	const durationMs = timer.elapsedMs();
	console.error(
		`[watch] scan complete: ${advisories.length} advisory(ies), ${fatalCount} fatal (${durationMs}ms)`,
	);

	if (options.report) {
		const report = await supplyChain.report(options.report, undefined, {
			domain: domainCtx?.domain,
			colors: domainCtx?.config.colors,
			operatorQr: domainCtx ? undefined : false,
		});
		if (options.output) {
			const ext = options.report === 'html' ? 'html' : options.report === 'json' ? 'json' : 'md';
			const filename = `scan-${Date.now()}.${ext}`;
			const outputPath = path.resolve(options.output, filename);
			await Bun.write(outputPath, report);
			console.error(`[watch] report written to ${outputPath}`);
		}
	}
}

/**
 * Start watching the project for dependency changes.
 *
 * Note: `Bun.watch` is not available in this Bun runtime, so this uses the
 * stable Node.js `fs.watch` API.
 */
export function startWatch(options: WatchOptions = {}): WatchSession {
	const projectRoot = process.cwd();
	const debounceMs = options.debounceMs ?? 300;

	const watchedPaths = [
		path.resolve(projectRoot, 'package.json'),
		path.resolve(projectRoot, 'bun.lockb'),
	];
	if (options.feedPath) {
		watchedPaths.push(path.resolve(options.feedPath));
	}

	const ac = new AbortController();
	let scanning = false;

	const onChange = createAsyncDebouncer(async () => {
		if (scanning) return;
		scanning = true;
		try {
			await performScan(options);
		} catch (error) {
			console.error('[watch] scan failed:', error instanceof Error ? error.message : String(error));
		} finally {
			scanning = false;
		}
	}, debounceMs);

	const watchers: FSWatcher[] = [];
	for (const filePath of watchedPaths) {
		try {
			const watcher = watch(filePath, event => {
				if (event === 'change') {
					onChange();
				}
			});
			watchers.push(watcher);
		} catch (error) {
			console.error(`[watch] could not watch ${filePath}:`, error);
		}
	}

	console.error(`[watch] watching ${watchers.length} file(s). Press Ctrl+C to stop.`);

	const shutdown = () => {
		ac.abort();
		for (const w of watchers) {
			try {
				w.close();
			} catch {
				/* ignore close errors */
			}
		}
		console.error('[watch] shutting down.');
	};

	const disposeSignals = onInterruptSignals(shutdown);

	return {watchers, abort: shutdown, disposeSignals};
}

/**
 * Run the watch loop until the process receives a signal.
 */
export async function watchSupplyChain(options: WatchOptions = {}): Promise<void> {
	const session = startWatch(options);
	try {
		await waitForInterruptSignal();
	} finally {
		session.abort();
		session.disposeSignals();
	}
}
