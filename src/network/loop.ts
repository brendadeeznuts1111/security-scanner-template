import {existsSync, readFileSync, statSync} from 'fs';
import path from 'path';
import {auditBundleNetwork} from '../intel/network-audit.ts';
import type {PackageSemverViolation} from '../intel/semver-checks.ts';
import type {PatternMatch} from '../scan/patterns/index.ts';
import type {
	NetworkAuditSummary,
	NetworkHealthProbeResult,
	NetworkHealthStatus,
	NetworkLoopStatus,
} from './types.ts';

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
	healthUrl?: string;
	probeInterval?: number;
	watch?: boolean;
	watchInterval?: number;
	failOnHealth?: boolean;
	scanPatterns: (distPath: string) => Promise<PatternMatch[]>;
	checkPackageVersions: (packages: Record<string, string>) => Promise<PackageSemverViolation[]>;
	recordAudit?: (summary: NetworkAuditSummary) => Promise<void>;
	onHealthFailure?: (result: NetworkHealthProbeResult) => void;
}

const DIST_GLOB = '**/*.{js,mjs,cjs,css,html,json}';

const DEFAULT_PROBE_INTERVAL_MS = 8000;
const DEFAULT_WATCH_INTERVAL_MS = 750;

function resolveHealthStatus(ok: boolean, reachable: boolean): NetworkHealthStatus {
	if (!reachable) return 'unreachable';
	return ok ? 'healthy' : 'degraded';
}

/** Probe a health endpoint (exported for tests). */
export async function probeNetworkHealth(
	url: string,
	timeoutMs = 10_000,
): Promise<NetworkHealthProbeResult> {
	const start = performance.now();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, {signal: controller.signal});
		const latencyMs = Math.round(performance.now() - start);
		return {
			status: resolveHealthStatus(response.ok, true),
			latencyMs,
			statusCode: response.status,
		};
	} catch {
		return {
			status: 'unreachable',
			latencyMs: Math.round(performance.now() - start),
		};
	} finally {
		clearTimeout(timer);
	}
}

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

async function readDependencyMap(
	projectRoot: string,
	distPath: string,
): Promise<Record<string, string> | null> {
	const candidates = [
		path.join(distPath, 'package.json'),
		path.join(projectRoot, 'package.json'),
	];
	for (const pkgPath of candidates) {
		if (!existsSync(pkgPath)) continue;
		try {
			const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
				dependencies?: Record<string, string>;
				devDependencies?: Record<string, string>;
			};
			return {...pkg.dependencies, ...pkg.devDependencies};
		} catch {
			continue;
		}
	}
	return null;
}

export class NetworkLoop {
	private readonly options: Required<
		Pick<NetworkLoopOptions, 'probeInterval' | 'watchInterval' | 'failOnHealth' | 'watch'>
	> &
		NetworkLoopOptions;
	private running = false;
	private probeTimer?: ReturnType<typeof setInterval>;
	private watchTimer?: ReturnType<typeof setInterval>;
	private lastDistHash?: string;
	private lastAuditAt?: string;
	private probeCount = 0;
	private auditCount = 0;

	constructor(options: NetworkLoopOptions) {
		this.options = {
			probeInterval: DEFAULT_PROBE_INTERVAL_MS,
			watchInterval: DEFAULT_WATCH_INTERVAL_MS,
			failOnHealth: false,
			watch: false,
			...options,
		};
	}

	status(): NetworkLoopStatus {
		return {
			running: this.running,
			domain: this.options.domainId,
			distPath: this.options.distPath,
			healthUrl: this.options.healthUrl,
			probeIntervalMs: this.options.probeInterval,
			watchEnabled: this.options.watch === true,
			watchIntervalMs: this.options.watchInterval,
			lastAuditAt: this.lastAuditAt,
			lastDistHash: this.lastDistHash,
			probeCount: this.probeCount,
			auditCount: this.auditCount,
		};
	}

	async start(): Promise<void> {
		if (this.running) return;
		this.running = true;
		console.error(`[${this.options.domainId}] Starting network loop`);

		await this.fullAudit();

		if (this.options.healthUrl) {
			this.probeTimer = setInterval(() => {
				void this.probeHealth();
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
		console.error(`[${this.options.domainId}] Network loop stopped`);
	}

	/** Run a single audit cycle (for tests and one-shot CLI use). */
	async auditNow(): Promise<NetworkAuditSummary> {
		return this.fullAudit();
	}

	private async fullAudit(): Promise<NetworkAuditSummary> {
		const distPath = this.options.distPath;
		const summaryParts: string[] = [];

		const patternMatches = await this.options.scanPatterns(distPath);
		summaryParts.push(`patterns=${patternMatches.length}`);

		const bundleNetwork = await auditBundleNetwork(distPath);
		if (bundleNetwork.unique > 0) {
			summaryParts.push(`endpoints=${bundleNetwork.unique}`);
		}
		if (bundleNetwork.healthRoutes.length > 0) {
			summaryParts.push(`routes=${bundleNetwork.healthRoutes.length}`);
		}

		let semverViolations: PackageSemverViolation[] = [];
		const deps = await readDependencyMap(this.options.projectRoot, distPath);
		if (deps && Object.keys(deps).length > 0) {
			semverViolations = await this.options.checkPackageVersions(deps);
			summaryParts.push(`semver=${semverViolations.length}`);
		}

		let health: NetworkHealthProbeResult | undefined;
		if (this.options.healthUrl) {
			health = await this.probeHealth();
			summaryParts.push(`health=${health.status} latency=${health.latencyMs}ms`);
		}

		const summary: NetworkAuditSummary = {
			domain: this.options.domainId,
			timestamp: new Date().toISOString(),
			patternMatches: patternMatches.length,
			semverViolations: semverViolations.length,
			bundleEndpoints: bundleNetwork.unique,
			bundleHealthRoutes: bundleNetwork.healthRoutes.length,
			healthStatus: health?.status,
			healthLatencyMs: health?.latencyMs,
		};

		this.lastAuditAt = summary.timestamp;
		this.auditCount += 1;
		console.error(`[${this.options.domainId}] audit ${summaryParts.join(' ')}`);

		if (this.options.recordAudit) {
			await this.options.recordAudit(summary);
		}

		return summary;
	}

	private async probeHealth(): Promise<NetworkHealthProbeResult> {
		const url = this.options.healthUrl;
		if (!url) {
			return {status: 'unreachable', latencyMs: 0};
		}

		const result = await probeNetworkHealth(url);
		this.probeCount += 1;
		console.error(
			`[${this.options.domainId}] probe health=${result.status} probes=${this.probeCount} latency=${result.latencyMs}ms`,
		);

		if (this.options.failOnHealth && result.status !== 'healthy') {
			if (this.options.onHealthFailure) {
				this.options.onHealthFailure(result);
			} else {
				throw new NetworkHealthFailure(result);
			}
		}

		return result;
	}

	private async watchDist(): Promise<void> {
		const currentHash = await computeDistFingerprint(this.options.distPath);
		if (this.lastDistHash && currentHash !== this.lastDistHash) {
			console.error(`[${this.options.domainId}] watch (dist changed) running audit`);
			await this.fullAudit();
		}
		this.lastDistHash = currentHash;
	}
}