/**
 * Network audit loop — dist watch, health probes, baseline drift.
 *
 * @see https://github.com/oven-sh/bun/blob/main/docs/runtime/http/server.mdx
 * @see https://github.com/oven-sh/bun/blob/main/docs/runtime/watch.mdx
 * @see https://github.com/Effect-TS/effect/blob/main/packages/effect/src/Schedule.ts
 */
import {existsSync, statSync} from 'fs';
import path from 'path';
import type {DomainConfig} from '../config/types.ts';
import type {PackageSemverViolation} from '../intel/semver-checks.ts';
import type {PatternMatch} from '../scan/patterns/index.ts';
import {defaultNetworkBaselinePath} from '../intel/network-baseline.ts';
import {
	NetworkDriftFailure,
	runNetworkProbeTick,
	runNetworkTick,
	type NetworkTickOptions,
} from './tick.ts';
import type {NetworkAuditSummary, NetworkHealthProbeResult, NetworkLoopStatus} from './types.ts';

export {probeNetworkHealth} from './probe.ts';
export {NetworkDriftFailure} from './tick.ts';

export class NetworkHealthFailure extends Error {
	readonly result: NetworkHealthProbeResult;

	constructor(result: NetworkHealthProbeResult) {
		super(`Health check failed: ${result.status}`);
		this.name = 'NetworkHealthFailure';
		this.result = result;
	}
}

export interface NetworkLoopOptions {
	domainId: string;
	projectRoot: string;
	distPath: string;
	domainConfig?: DomainConfig | null;
	healthUrl?: string;
	healthUrlSecret?: string;
	baselinePath?: string;
	updateBaseline?: boolean;
	probeInterval?: number;
	watch?: boolean;
	watchInterval?: number;
	failOnHealth?: boolean;
	failOnDrift?: boolean;
	emitJson?: boolean;
	emitHerdrTab?: boolean;
	noColor?: boolean;
	scanPatterns: (distPath: string) => Promise<PatternMatch[]>;
	checkPackageVersions: (packages: Record<string, string>) => Promise<PackageSemverViolation[]>;
	recordAudit?: (summary: NetworkAuditSummary) => Promise<void>;
	onHealthFailure?: (result: NetworkHealthProbeResult) => void;
	onDriftFailure?: (summary: NetworkAuditSummary) => void;
}

const DIST_GLOB = '**/*.{js,mjs,cjs,css,html,json}';

const DEFAULT_PROBE_INTERVAL_MS = 8000;
const DEFAULT_WATCH_INTERVAL_MS = 750;

/** Fingerprint a dist directory for change detection (exported for tests). */
export async function computeDistFingerprint(dir: string): Promise<string> {
	if (!existsSync(dir)) {
		return '';
	}

	let fingerprint = '';
	const glob = new Bun.Glob(DIST_GLOB);
	for await (const relative of glob.scan({cwd: dir, onlyFiles: true})) {
		const full = path.join(dir, relative);
		try {
			const stat = statSync(full);
			fingerprint += `${relative}:${stat.size}:${stat.mtimeMs};`;
		} catch {
			/* skip unreadable */
		}
	}
	return Bun.hash(fingerprint).toString(16);
}

export class NetworkLoop {
	private readonly options: Required<
		Pick<
			NetworkLoopOptions,
			| 'probeInterval'
			| 'watchInterval'
			| 'failOnHealth'
			| 'failOnDrift'
			| 'watch'
			| 'emitJson'
			| 'emitHerdrTab'
			| 'noColor'
		>
	> &
		NetworkLoopOptions;
	private running = false;
	private probeTimer?: ReturnType<typeof setInterval>;
	private watchTimer?: ReturnType<typeof setInterval>;
	private lastDistHash?: string;
	private lastAuditAt?: string;
	private resolvedHealthUrl?: string | null;
	private probeCount = 0;
	private auditCount = 0;
	private lastExitCode = 0;

	constructor(options: NetworkLoopOptions) {
		this.options = {
			probeInterval: DEFAULT_PROBE_INTERVAL_MS,
			watchInterval: DEFAULT_WATCH_INTERVAL_MS,
			failOnHealth: false,
			failOnDrift: false,
			watch: false,
			emitJson: false,
			emitHerdrTab: false,
			noColor: false,
			...options,
		};
	}

	status(): NetworkLoopStatus {
		return {
			running: this.running,
			domain: this.options.domainId,
			distPath: this.options.distPath,
			healthUrl: this.options.healthUrl ?? this.resolvedHealthUrl ?? undefined,
			healthUrlSecret: this.options.healthUrlSecret,
			baselinePath:
				this.options.baselinePath ??
				defaultNetworkBaselinePath(this.options.domainId, this.options.projectRoot),
			probeIntervalMs: this.options.probeInterval,
			watchEnabled: this.options.watch === true,
			watchIntervalMs: this.options.watchInterval,
			lastAuditAt: this.lastAuditAt,
			lastDistHash: this.lastDistHash,
			probeCount: this.probeCount,
			auditCount: this.auditCount,
			failOnHealth: this.options.failOnHealth,
			failOnDrift: this.options.failOnDrift,
			emitJson: this.options.emitJson,
			emitHerdrTab: this.options.emitHerdrTab,
		};
	}

	async start(): Promise<void> {
		if (this.running) return;
		this.running = true;

		const first = await this.runTick('initial');
		this.lastExitCode = first.exitCode;
		if (first.exitCode !== 0) {
			this.handleFatalExit(first);
			return;
		}

		if (this.resolvedHealthUrl) {
			this.probeTimer = setInterval(() => {
				void this.runProbeOnly();
			}, this.options.probeInterval);
		}

		if (this.options.watch) {
			this.lastDistHash = await computeDistFingerprint(this.options.distPath);
			this.watchTimer = setInterval(() => {
				void this.watchDist();
			}, this.options.watchInterval);
		}
	}

	stop(): void {
		if (!this.running) return;
		this.running = false;
		if (this.probeTimer) clearInterval(this.probeTimer);
		if (this.watchTimer) clearInterval(this.watchTimer);
		this.probeTimer = undefined;
		this.watchTimer = undefined;
	}

	/** Run a single audit cycle (for tests and one-shot CLI use). */
	async auditNow(): Promise<NetworkAuditSummary> {
		const result = await this.runTick('audit');
		return result.summary;
	}

	lastExit(): number {
		return this.lastExitCode;
	}

	private tickBase(phase: NetworkTickOptions['phase'], trigger?: string): NetworkTickOptions {
		return {
			domainId: this.options.domainId,
			projectRoot: this.options.projectRoot,
			distPath: this.options.distPath,
			phase,
			trigger,
			healthUrl: this.options.healthUrl,
			healthUrlSecret: this.options.healthUrlSecret,
			baselinePath: this.options.baselinePath,
			updateBaseline: this.options.updateBaseline,
			failOnHealth: this.options.failOnHealth,
			failOnDrift: this.options.failOnDrift,
			emitJson: this.options.emitJson,
			emitHerdrTab: this.options.emitHerdrTab,
			noColor: this.options.noColor,
			domainConfig: this.options.domainConfig,
			scanPatterns: this.options.scanPatterns,
			checkPackageVersions: this.options.checkPackageVersions,
		};
	}

	private async runTick(
		phase: NetworkTickOptions['phase'],
		trigger?: string,
	): Promise<Awaited<ReturnType<typeof runNetworkTick>>> {
		const result = await runNetworkTick(this.tickBase(phase, trigger));
		if (!this.resolvedHealthUrl && result.summary.healthStatus) {
			const {resolveHealthUrl} = await import('./health-secrets.ts');
			const resolved = await resolveHealthUrl({
				healthUrl: this.options.healthUrl,
				healthUrlSecret: this.options.healthUrlSecret,
				domain: this.options.domainId,
				domainService: this.options.domainConfig?.secrets.service,
			});
			this.resolvedHealthUrl = resolved.url;
		}

		this.lastAuditAt = result.summary.timestamp;
		this.auditCount += 1;

		if (this.options.recordAudit) {
			await this.options.recordAudit(result.summary);
		}

		if (result.exitCode !== 0) {
			this.lastExitCode = result.exitCode;
			if (result.delta?.hasEndpointDrift) {
				this.options.onDriftFailure?.(result.summary);
			}
			if (
				this.options.failOnHealth &&
				result.summary.healthStatus &&
				result.summary.healthStatus !== 'healthy'
			) {
				this.options.onHealthFailure?.({
					status: result.summary.healthStatus,
					latencyMs: result.summary.healthLatencyMs ?? 0,
				});
			}
		}

		return result;
	}

	private async runProbeOnly(): Promise<void> {
		if (!this.resolvedHealthUrl) return;
		this.probeCount += 1;
		const result = await runNetworkProbeTick(this.resolvedHealthUrl, this.options.domainId, {
			noColor: this.options.noColor,
			domainConfig: this.options.domainConfig,
			emitJson: this.options.emitJson,
			failOnHealth: false,
		});
		if (this.options.failOnHealth && result.status !== 'healthy') {
			this.handleHealthFailure(result);
		}
	}

	private async watchDist(): Promise<void> {
		const currentHash = await computeDistFingerprint(this.options.distPath);
		if (this.lastDistHash && currentHash !== this.lastDistHash) {
			const tick = await this.runTick('watch', 'dist changed');
			this.lastExitCode = tick.exitCode;
			if (tick.exitCode !== 0) {
				this.handleFatalExit(tick);
			}
		}
		this.lastDistHash = currentHash;
	}

	private handleHealthFailure(result: NetworkHealthProbeResult): void {
		this.stop();
		if (this.options.onHealthFailure) {
			this.options.onHealthFailure(result);
		} else {
			throw new NetworkHealthFailure(result);
		}
	}

	private handleFatalExit(tick: Awaited<ReturnType<typeof runNetworkTick>>): void {
		this.stop();
		if (tick.delta?.hasEndpointDrift) {
			if (this.options.onDriftFailure) {
				this.options.onDriftFailure(tick.summary);
			} else {
				throw new NetworkDriftFailure(tick.delta);
			}
		}
		if (
			this.options.failOnHealth &&
			tick.summary.healthStatus &&
			tick.summary.healthStatus !== 'healthy'
		) {
			this.handleHealthFailure({
				status: tick.summary.healthStatus,
				latencyMs: tick.summary.healthLatencyMs ?? 0,
			});
		}
	}
}
