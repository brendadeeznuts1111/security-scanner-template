import {existsSync, readdirSync, statSync, watch, type FSWatcher} from 'fs';
import path from 'path';
import {resolvePolicyWatchPaths} from '../domain/policy-bridge.ts';
import {resolveInstallWatchPaths} from '../utils/install-runtime.ts';
import {createAsyncDebouncer} from '../utils/debounce.ts';
import {onInterruptSignals, waitForInterruptSignal} from '../utils/signals.ts';
import {resolveProjectRootFromPath, resolveSupplyChainScanPath} from './supply-chain-path.ts';
import {runSupplyChainDeepScanLoop, type SupplyChainLoopOptions} from './supply-chain-loop.ts';

export interface SupplyChainWatchOptions extends SupplyChainLoopOptions {
	debounceMs?: number;
}

function resolveBundleWatchPaths(scanPath: string): string[] {
	const resolved = path.resolve(scanPath);
	if (!existsSync(resolved)) {
		return [];
	}
	try {
		const stat = statSync(resolved);
		if (stat.isFile()) {
			return [resolved];
		}
	} catch {
		return [];
	}

	const paths: string[] = [];
	const walk = (dir: string, depth: number): void => {
		if (depth > 4) return;
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry);
			try {
				const entryStat = statSync(full);
				if (entryStat.isFile() && /\.(js|mjs|cjs|css|html|json)$/i.test(entry)) {
					paths.push(full);
				} else if (entryStat.isDirectory() && !entry.startsWith('.')) {
					walk(full, depth + 1);
				}
			} catch {
				/* skip unreadable */
			}
		}
	};
	walk(resolved, 0);
	return paths.slice(0, 64);
}

export function resolveSupplyChainWatchPaths(options: SupplyChainWatchOptions): string[] {
	const scanPath = resolveSupplyChainScanPath(options.path);
	const projectRoot = options.projectRoot ?? resolveProjectRootFromPath(scanPath) ?? process.cwd();
	const paths = new Set<string>([
		...resolveBundleWatchPaths(scanPath),
		...resolveInstallWatchPaths(projectRoot),
		...resolvePolicyWatchPaths(projectRoot),
	]);
	if (options.policyPath && existsSync(options.policyPath)) {
		paths.add(path.resolve(options.policyPath));
	}
	return [...paths].filter(filePath => existsSync(filePath));
}

export interface SupplyChainWatchSession {
	watchers: FSWatcher[];
	abort: () => void;
	disposeSignals: () => void;
}

export function startSupplyChainWatch(options: SupplyChainWatchOptions): SupplyChainWatchSession {
	const debounceMs = options.debounceMs ?? 500;
	const watchedPaths = resolveSupplyChainWatchPaths(options);
	let scanning = false;

	const onChange = createAsyncDebouncer(async () => {
		if (scanning) return;
		scanning = true;
		try {
			await runSupplyChainDeepScanLoop({...options, fix: options.fix ?? false});
		} catch (error) {
			console.error(
				'[supply-chain watch] scan failed:',
				error instanceof Error ? error.message : String(error),
			);
		} finally {
			scanning = false;
		}
	}, debounceMs);

	const watchers: FSWatcher[] = [];
	for (const filePath of watchedPaths) {
		try {
			const watcher = watch(filePath, event => {
				if (event === 'change') onChange();
			});
			watchers.push(watcher);
		} catch (error) {
			console.error(`[supply-chain watch] could not watch ${filePath}:`, error);
		}
	}

	console.error(`[supply-chain watch] watching ${watchers.length} file(s). Press Ctrl+C to stop.`);

	const shutdown = () => {
		for (const w of watchers) {
			try {
				w.close();
			} catch {
				/* ignore */
			}
		}
		console.error('[supply-chain watch] shutting down.');
	};

	const disposeSignals = onInterruptSignals(shutdown);
	return {watchers, abort: shutdown, disposeSignals};
}

export async function watchSupplyChainDeepScan(options: SupplyChainWatchOptions): Promise<void> {
	await runSupplyChainDeepScanLoop({...options, fix: options.fix ?? false});
	const session = startSupplyChainWatch(options);
	try {
		await waitForInterruptSignal();
	} finally {
		session.abort();
		session.disposeSignals();
	}
}
