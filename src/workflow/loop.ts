/**
 * Workflow scanner loop — interval + watch orchestration.
 *
 * Ground truth:
 * @see https://github.com/oven-sh/bun/blob/main/docs/runtime/watch.mdx
 * @see https://github.com/oven-sh/bun/blob/main/docs/guides/process/os-signals.mdx
 * @see https://github.com/Effect-TS/effect/blob/main/packages/effect/src/Schedule.ts
 */
import {existsSync} from 'fs';
import {watch, type FSWatcher} from 'fs';
import path from 'path';
import type {DomainRegistry} from '../config/registry.ts';
import type {DomainWorkflowConfig} from '../config/types.ts';
import {createAsyncDebouncer} from '../utils/debounce.ts';
import {onInterruptSignals, waitForInterruptSignal} from '../utils/signals.ts';
import {runWorkflowEffects} from './effects/index.ts';
import {aggregateWorkflowReport, formatWorkflowOutput, workflowExitCode} from './output.ts';
import {
	createWorkflowScannerContext,
	resolveWorkflowScanners,
	WORKFLOW_SCANNER_IDS,
} from './scanners.ts';
import {
	buildWorkflowSeedDocument,
	computeWorkflowSeedDrift,
	defaultWorkflowSeedPath,
	hasWorkflowSeedDrift,
	loadWorkflowSeed,
	resolveWorkflowSeedPath,
	writeWorkflowSeed,
	type WorkflowSeedDocument,
} from './seed.ts';
import type {
	ScannerResult,
	WorkflowLoopOptions,
	WorkflowRunReport,
	WorkflowSeedDrift,
} from './types.ts';

export interface WorkflowLoopStatus {
	running: boolean;
	domain: string;
	lastRunAt?: string;
	runCount: number;
	scanners: string[];
}

export class WorkflowLoop {
	private readonly domainName: string;
	private readonly registry: DomainRegistry;
	private readonly options: Required<
		Pick<WorkflowLoopOptions, 'interval' | 'watchDebounceMs' | 'output' | 'noColor'>
	> &
		WorkflowLoopOptions;
	private running = false;
	private timer?: ReturnType<typeof setInterval>;
	private watchers: FSWatcher[] = [];
	private runCount = 0;
	private lastRunAt?: string;
	private lastReport?: WorkflowRunReport;
	private seedDocument: WorkflowSeedDocument | null = null;
	private lastDrift: WorkflowSeedDrift | null = null;

	constructor(domainName: string, registry: DomainRegistry, options: WorkflowLoopOptions = {}) {
		this.domainName = domainName;
		this.registry = registry;
		this.options = {
			scanners: options.scanners ?? [...WORKFLOW_SCANNER_IDS],
			watchPaths: options.watchPaths ?? ['./dist', './src', './domains'],
			watchDebounceMs: options.watchDebounceMs ?? 500,
			interval: options.interval ?? 60_000,
			output: options.output ?? 'table',
			dryRun: options.dryRun ?? false,
			failOnIssue: options.failOnIssue ?? false,
			failOnSeverity: options.failOnSeverity,
			noColor: options.noColor ?? false,
			tlsHost: options.tlsHost,
			tlsPort: options.tlsPort,
			tlsDeep: options.tlsDeep,
			patternPaths: options.patternPaths,
			watch: options.watch ?? false,
			seedPath: options.seedPath,
			seedWritePath: options.seedWritePath,
			failOnDrift: options.failOnDrift ?? false,
			effects: options.effects,
		};
	}

	static fromDomainConfig(
		domainName: string,
		registry: DomainRegistry,
		config: DomainWorkflowConfig,
		overrides: WorkflowLoopOptions = {},
	): WorkflowLoop {
		return new WorkflowLoop(domainName, registry, {
			scanners: config.scanners,
			watch: config.watch,
			watchPaths: config.watchPaths,
			watchDebounceMs: config.debounceMs,
			interval: config.interval,
			output: config.output,
			failOnIssue: config.failOnIssue,
			failOnSeverity: config.failOnSeverity,
			seedPath: config.seedPath,
			seedWritePath: config.seedWritePath,
			failOnDrift: config.failOnDrift,
			effects: {
				log: config.logEffects,
				alert: config.alertUrl,
				fix: config.fix,
				report: config.report,
			},
			...overrides,
		});
	}

	seedState(): WorkflowSeedDocument | null {
		return this.seedDocument;
	}

	lastSeedDrift(): WorkflowSeedDrift | null {
		return this.lastDrift;
	}

	async loadSeed(): Promise<boolean> {
		const seedPath = this.resolvedSeedPath();
		if (!seedPath) {
			return false;
		}
		if (!(await Bun.file(seedPath).exists())) {
			console.error(`[workflow] seed file not found: ${seedPath}`);
			return false;
		}
		try {
			this.seedDocument = await loadWorkflowSeed(seedPath, this.domainName);
			console.error(`[workflow] loaded seed from ${seedPath}`);
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[workflow] ${message}`);
			return false;
		}
	}

	private resolvedSeedPath(): string | undefined {
		if (!this.options.seedPath) return undefined;
		return resolveWorkflowSeedPath(this.options.seedPath, this.registry.root);
	}

	private resolvedSeedWritePath(): string | undefined {
		if (this.options.seedWritePath === undefined) {
			return undefined;
		}
		const trimmed = this.options.seedWritePath.trim();
		if (!trimmed) {
			return defaultWorkflowSeedPath(this.domainName, this.registry.root);
		}
		return resolveWorkflowSeedPath(trimmed, this.registry.root);
	}

	private async writeSeed(results: ScannerResult[]): Promise<void> {
		const writePath = this.resolvedSeedWritePath();
		if (!writePath) return;
		const document = buildWorkflowSeedDocument(this.domainName, results);
		await writeWorkflowSeed(writePath, document);
		console.error(`[workflow] seed written to ${writePath}`);
	}

	status(): WorkflowLoopStatus {
		return {
			running: this.running,
			domain: this.domainName,
			lastRunAt: this.lastRunAt,
			runCount: this.runCount,
			scanners: this.options.scanners ?? [...WORKFLOW_SCANNER_IDS],
		};
	}

	lastRun(): WorkflowRunReport | undefined {
		return this.lastReport;
	}

	async runAll(): Promise<WorkflowRunReport> {
		const ctx = await createWorkflowScannerContext(this.registry, this.domainName, {
			tlsHost: this.options.tlsHost,
			tlsPort: this.options.tlsPort,
			tlsDeep: this.options.tlsDeep,
			patternPaths: this.options.patternPaths,
		});

		const scanners = resolveWorkflowScanners(this.options.scanners);
		const results: ScannerResult[] = [];

		for (const scanner of scanners) {
			try {
				results.push(await scanner.run(ctx));
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				results.push({
					scannerId: scanner.id,
					domain: this.domainName,
					timestamp: new Date().toISOString(),
					status: 'fail',
					issues: [{severity: 'critical', message: `Scanner error: ${message}`}],
					error: message,
				});
			}
		}

		ctx.domain.close();

		let drift: WorkflowSeedDrift | null = null;
		if (this.seedDocument) {
			drift = computeWorkflowSeedDrift(results, this.seedDocument);
			this.lastDrift = drift;
			if (hasWorkflowSeedDrift(drift)) {
				console.error(
					`[workflow] seed drift detected for ${this.domainName}: ${JSON.stringify(drift)}`,
				);
			}
		}

		if (this.options.seedWritePath !== undefined) {
			await this.writeSeed(results);
		}

		const report = aggregateWorkflowReport(
			this.domainName,
			results,
			this.seedDocument ? (drift ?? {}) : undefined,
		);
		this.lastReport = report;
		this.lastRunAt = report.timestamp;
		this.runCount += 1;

		const formatted = formatWorkflowOutput(report, this.options.output, this.options.noColor);
		if (this.options.output === 'ndjson') {
			process.stdout.write(formatted);
		} else {
			console.log(formatted.trimEnd());
		}

		const effectsPromise = runWorkflowEffects({
			domain: this.domainName,
			projectRoot: this.registry.root,
			registry: this.registry,
			report,
			results,
			drift,
			effects: this.options.effects,
		});
		const awaitEffects = !this.running || this.options.dryRun === true;
		if (awaitEffects) {
			await effectsPromise;
		} else {
			void effectsPromise.catch((error: unknown) => {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`[workflow] ${this.domainName} effect error: ${message}`);
			});
		}

		return report;
	}

	async start(): Promise<void> {
		if (this.running) return;
		this.running = true;
		console.error(`[workflow] starting loop for ${this.domainName}`);

		await this.loadSeed();
		await this.runAll();

		if (this.options.interval > 0 && !this.options.dryRun) {
			this.timer = setInterval(() => {
				void this.runAll();
			}, this.options.interval);
		}

		if (this.options.watch && !this.options.dryRun) {
			const debounced = createAsyncDebouncer(() => {
				void this.runAll();
			}, this.options.watchDebounceMs);
			for (const watchPath of this.options.watchPaths ?? []) {
				const resolved = path.resolve(this.registry.root, watchPath);
				if (!existsSync(resolved)) continue;
				const watcher = watch(resolved, {recursive: true}, () => {
					console.error(`[workflow] change detected under ${watchPath}`);
					debounced();
				});
				this.watchers.push(watcher);
			}
		}

		if (!this.options.dryRun && (this.options.interval > 0 || this.options.watch)) {
			const disposeSignals = onInterruptSignals(() => {
				void this.stop();
			});
			try {
				await waitForInterruptSignal();
			} finally {
				await this.stop();
				disposeSignals();
			}
		}
	}

	async stop(): Promise<void> {
		this.running = false;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
		for (const watcher of this.watchers) {
			watcher.close();
		}
		this.watchers = [];
		console.error(`[workflow] stopped for ${this.domainName}`);
	}

	exitCode(
		report: WorkflowRunReport = this.lastReport ?? aggregateWorkflowReport(this.domainName, []),
	): number {
		if (this.options.failOnDrift && hasWorkflowSeedDrift(report.drift)) {
			return 1;
		}
		return workflowExitCode(report, {
			failOnIssue: this.options.failOnIssue,
			failOnSeverity: this.options.failOnSeverity,
			failOnDrift: this.options.failOnDrift,
		});
	}
}
