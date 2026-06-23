import {probeEndpointMeta} from './endpoint-probe.ts';
import type {EndpointMetaProbeResult} from './endpoint-types.ts';
import type {NetworkHealthStatus} from './network-baseline.ts';

export {
	formatSecretLogLabel,
	networkHealthSecretService,
	resolveHealthSecretRef,
	resolveHealthUrl,
	type HealthUrlResolution,
	type HealthUrlSecretRef,
} from '../network/health-secrets.ts';

export interface NetworkHealthProbeSummary {
	status: NetworkHealthStatus;
	probesOk: number;
	probesTotal: number;
	latencyMs: number;
	results: EndpointMetaProbeResult[];
}

/** Probe health URL and optional extra endpoints; derive aggregate health status. */
export async function probeNetworkHealth(options: {
	healthUrl?: string | null;
	extraUrls?: readonly string[];
	timeoutMs?: number;
}): Promise<NetworkHealthProbeSummary> {
	const targets = new Set<string>();
	if (options.healthUrl) {
		targets.add(options.healthUrl);
	}
	for (const url of options.extraUrls ?? []) {
		targets.add(url);
	}

	if (targets.size === 0) {
		return {
			status: 'unknown',
			probesOk: 0,
			probesTotal: 0,
			latencyMs: 0,
			results: [],
		};
	}

	const results: EndpointMetaProbeResult[] = [];
	for (const url of targets) {
		results.push(
			await probeEndpointMeta(
				{url, label: url === options.healthUrl ? 'health' : 'endpoint', method: 'GET'},
				{timeoutMs: options.timeoutMs ?? 10_000},
			),
		);
	}

	const probesOk = results.filter(result => result.ok).length;
	const probesTotal = results.length;
	const latencyMs = Math.max(...results.map(result => result.latencyMs), 0);
	let status: NetworkHealthStatus = 'unknown';
	if (probesTotal === 0) {
		status = 'unknown';
	} else if (probesOk === probesTotal) {
		status = 'healthy';
	} else if (probesOk > 0) {
		status = 'degraded';
	} else {
		status = 'unhealthy';
	}

	return {status, probesOk, probesTotal, latencyMs, results};
}