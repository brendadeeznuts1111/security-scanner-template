import path from 'path';
import type {DomainConfig} from '../config/types.ts';
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
import {scanDomainEndpointProbes} from '../intel/endpoint-scan.ts';
import {summarizeEndpointProbeReport} from '../intel/endpoint-probe.ts';
import {loadProjectPolicies} from '../policy/loader.ts';
import type {PackageSemverViolation} from '../intel/semver-checks.ts';
import type {PatternMatch} from '../scan/patterns/index.ts';
import {resolveHealthUrl} from './health-secrets.ts';
import {
	buildHerdrDoctorTabDocument,
	formatHerdrDoctorTabText,
} from './herdr-tab.ts';
import {
	formatNetworkLoopStatusLine,
	resolveNetworkLoopColors,
} from './loop-color.ts';
import {buildNetworkNdjsonEvent, formatNetworkNdjsonLine} from './ndjson.ts';
import type {NetworkAuditSummary, NetworkHealthProbeResult} from './types.ts';
import {probeNetworkHealth as probeSingleHealth} from './probe.ts';

export class NetworkDriftFailure extends Error {
	readonly delta: NetworkBaselineDelta;

	constructor(delta: NetworkBaselineDelta) {
		super('Network baseline drift detected');
		this.name = 'NetworkDriftFailure';
		this.delta = delta;
	}
}

export interface NetworkTickOptions {
	domainId: string;
	projectRoot: string;
	distPath: string;
	phase: 'initial' | 'watch' | 'probe' | 'tick' | 'audit';
	trigger?: string;
	healthUrl?: string;
	healthUrlSecret?: string;
	baselinePath?: string;
	updateBaseline?: boolean;
	failOnHealth?: boolean;
	failOnDrift?: boolean;
	emitJson?: boolean;
	emitHerdrTab?: boolean;
	noColor?: boolean;
	domainConfig?: DomainConfig | null;
	scanPatterns: (distPath: string) => Promise<PatternMatch[]>;
	checkPackageVersions: (packages: Record<string, string>) => Promise<PackageSemverViolation[]>;
}

export interface NetworkTickResult {
	summary: NetworkAuditSummary;
	delta?: NetworkBaselineDelta;
	baselinePath: string;
	exitCode: number;
}

async function readDependencyMap(
	projectRoot: string,
	distPath: string,
): Promise<Record<string, string> | null> {
	const {existsSync, readFileSync} = await import('fs');
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

function resolveBaselinePath(
	options: NetworkTickOptions,
): string {
	if (options.baselinePath) {
		return path.resolve(options.baselinePath);
	}
	return defaultNetworkBaselinePath(options.domainId, options.projectRoot);
}

function mapMetaProbeReportToResult(
	summary: ReturnType<typeof summarizeEndpointProbeReport>,
): NetworkHealthProbeResult {
	return {
		status: summary.status,
		latencyMs: summary.latencyMs,
		probesOk: summary.probesOk,
		probesTotal: summary.probesTotal,
	};
}

export async function runNetworkTick(options: NetworkTickOptions): Promise<NetworkTickResult> {
	const patternMatches = await options.scanPatterns(options.distPath);
	const bundleNetwork = await auditBundleNetwork(options.distPath);

	let semverViolations: PackageSemverViolation[] = [];
	const deps = await readDependencyMap(options.projectRoot, options.distPath);
	if (deps && Object.keys(deps).length > 0) {
		semverViolations = await options.checkPackageVersions(deps);
	}

	const healthResolution = await resolveHealthUrl({
		healthUrl: options.healthUrl,
		healthUrlSecret: options.healthUrlSecret,
		domain: options.domainId,
		domainService: options.domainConfig?.secrets.service,
	});

	let healthProbe: NetworkHealthProbeResult;
	if (options.domainConfig && healthResolution.url) {
		const policy = await loadProjectPolicies(options.projectRoot);
		const report = await scanDomainEndpointProbes({
			root: options.projectRoot,
			domain: options.domainId,
			config: options.domainConfig,
			policy,
			healthUrl: healthResolution.url,
			bundleNetwork,
		});
		healthProbe = mapMetaProbeReportToResult(summarizeEndpointProbeReport(report));
	} else if (healthResolution.url) {
		const {probeNetworkHealth} = await import('../intel/network-health.ts');
		const aggregate = await probeNetworkHealth({healthUrl: healthResolution.url});
		healthProbe = {
			status:
				aggregate.status === 'unhealthy' || aggregate.status === 'unknown'
					? 'unreachable'
					: aggregate.status,
			latencyMs: aggregate.latencyMs,
			probesOk: aggregate.probesOk,
			probesTotal: aggregate.probesTotal,
		};
	} else {
		healthProbe = {status: 'unreachable', latencyMs: 0, probesOk: 0, probesTotal: 0};
	}

	const baselinePath = resolveBaselinePath(options);
	const baseline = await loadNetworkBaseline(baselinePath);
	let delta: NetworkBaselineDelta | undefined;
	if (baseline) {
		delta = diffNetworkBaseline(baseline, {
			endpoints: bundleNetwork.endpoints,
			healthRoutes: bundleNetwork.healthRoutes,
			health:
				healthProbe.status === 'healthy'
					? 'healthy'
					: healthProbe.status === 'degraded'
						? 'degraded'
						: 'unhealthy',
		});
	}

	if (options.updateBaseline) {
		const document: NetworkBaselineDocument = {
			version: NETWORK_BASELINE_VERSION,
			domain: options.domainId,
			capturedAt: new Date().toISOString(),
			bundlePath: options.distPath,
			endpoints: bundleNetwork.endpoints,
			healthRoutes: bundleNetwork.healthRoutes,
			health:
				healthProbe.status === 'healthy'
					? 'healthy'
					: healthProbe.status === 'degraded'
						? 'degraded'
						: 'unhealthy',
		};
		await saveNetworkBaseline(baselinePath, document);
	}

	const summary: NetworkAuditSummary = {
		domain: options.domainId,
		timestamp: new Date().toISOString(),
		patternMatches: patternMatches.length,
		semverViolations: semverViolations.length,
		bundleEndpoints: bundleNetwork.unique,
		bundleHealthRoutes: bundleNetwork.healthRoutes.length,
		healthStatus: healthProbe.status,
		healthLatencyMs: healthProbe.latencyMs,
		delta,
	};

	const colors = resolveNetworkLoopColors(options.domainConfig, options.noColor);
	const deltaLine =
		delta && options.phase !== 'initial'
			? formatNetworkBaselineDelta(delta, options.trigger)
			: delta && options.phase === 'initial' && delta.hasEndpointDrift
				? formatNetworkBaselineDelta(delta)
				: undefined;

	const ndjsonType =
		options.phase === 'probe'
			? 'probe'
			: options.phase === 'watch'
				? 'watch'
				: options.phase === 'initial'
					? 'initial'
					: 'tick';

	if (options.emitJson) {
		const line = buildNetworkNdjsonEvent({
			type: ndjsonType,
			domain: options.domainId,
			networkUnique: bundleNetwork.unique,
			networkRaw: bundleNetwork.raw,
			endpoints: bundleNetwork.endpoints.length,
			healthRoutes: bundleNetwork.healthRoutes.length,
			health: healthProbe.status,
			probesOk: healthProbe.probesOk ?? 0,
			probesTotal: healthProbe.probesTotal ?? 0,
			latencyMs: healthProbe.latencyMs,
			patternMatches: patternMatches.length,
			semverViolations: semverViolations.length,
			trigger: options.trigger,
			delta,
		});
		process.stdout.write(formatNetworkNdjsonLine(line));
	} else if (options.emitHerdrTab) {
		const tab = buildHerdrDoctorTabDocument({
			domain: options.domainId,
			phase: options.phase,
			networkUnique: bundleNetwork.unique,
			networkRaw: bundleNetwork.raw,
			endpoints: bundleNetwork.endpoints.length,
			healthRoutes: bundleNetwork.healthRoutes.length,
			health: healthProbe.status,
			probesOk: healthProbe.probesOk ?? 0,
			probesTotal: healthProbe.probesTotal ?? 0,
			latencyMs: healthProbe.latencyMs,
			delta,
			bundlePath: options.distPath,
		});
		console.log(formatHerdrDoctorTabText(tab));
	} else {
		console.error(
			formatNetworkLoopStatusLine(
				{
					phase: options.phase === 'audit' ? 'tick' : options.phase,
					networkUnique: bundleNetwork.unique,
					networkRaw: bundleNetwork.raw,
					endpoints: bundleNetwork.endpoints.length,
					healthRoutes: bundleNetwork.healthRoutes.length,
					health: healthProbe.status,
					probesOk: healthProbe.probesOk ?? 0,
					probesTotal: healthProbe.probesTotal ?? 0,
					latencyMs: healthProbe.latencyMs,
					deltaLine,
				},
				colors,
				options.noColor,
			),
		);
	}

	let exitCode = 0;
	if (
		options.failOnHealth &&
		healthProbe.status !== 'healthy' &&
		healthProbe.probesTotal &&
		healthProbe.probesTotal > 0
	) {
		exitCode = 1;
	}
	if (options.failOnDrift && delta?.hasEndpointDrift) {
		exitCode = 1;
	}

	return {summary, delta, baselinePath, exitCode};
}

/** Lightweight probe-only tick (health interval callbacks). */
export async function runNetworkProbeTick(
	url: string,
	domainId: string,
	options: Pick<NetworkTickOptions, 'noColor' | 'domainConfig' | 'emitJson' | 'failOnHealth'> = {},
): Promise<NetworkHealthProbeResult> {
	const result = await probeSingleHealth(url);
	const colors = resolveNetworkLoopColors(options.domainConfig, options.noColor);
	if (options.emitJson) {
		const line = buildNetworkNdjsonEvent({
			type: 'probe',
			domain: domainId,
			networkUnique: 0,
			networkRaw: 0,
			endpoints: 0,
			healthRoutes: 0,
			health: result.status,
			probesOk: result.status === 'healthy' ? 1 : 0,
			probesTotal: 1,
			latencyMs: result.latencyMs,
		});
		process.stdout.write(formatNetworkNdjsonLine(line));
	} else {
		console.error(
			formatNetworkLoopStatusLine(
				{
					phase: 'probe',
					networkUnique: 0,
					networkRaw: 0,
					endpoints: 0,
					healthRoutes: 0,
					health: result.status,
					probesOk: result.status === 'healthy' ? 1 : 0,
					probesTotal: 1,
					latencyMs: result.latencyMs,
				},
				colors,
				options.noColor,
			),
		);
	}
	return result;
}