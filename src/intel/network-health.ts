import {colorize, TERMINAL} from '../color/index.ts';
import {detectSecretsBackend} from '../secrets-backend.ts';
import {probeEndpointMeta} from './endpoint-probe.ts';
import type {EndpointMetaProbeResult} from './endpoint-types.ts';
import type {NetworkHealthStatus} from './network-baseline.ts';

export interface HealthUrlSecretRef {
	service: string;
	name: string;
	raw: string;
}

export interface HealthUrlResolution {
	url: string | null;
	source: 'literal' | 'secret' | 'none';
	secretRef?: HealthUrlSecretRef;
	backend?: string;
	platform?: string;
	channel: 'vault';
}

/** Parse `service/name/path` secret spec (e.g. `sports-terminal/health/prod`). */
export function parseHealthUrlSecretSpec(spec: string): HealthUrlSecretRef {
	const trimmed = spec.trim();
	const slash = trimmed.indexOf('/');
	if (slash <= 0) {
		return {service: trimmed, name: 'health', raw: trimmed};
	}
	return {
		service: trimmed.slice(0, slash),
		name: trimmed.slice(slash + 1),
		raw: trimmed,
	};
}

/**
 * Resolve a health probe URL from a literal or Bun.secrets reference.
 * Logs under the domain vault channel; on Windows uses credential-manager isolation.
 */
export async function resolveHealthUrl(options: {
	healthUrl?: string;
	healthUrlSecret?: string;
	domainService?: string;
}): Promise<HealthUrlResolution> {
	if (options.healthUrl?.trim()) {
		return {url: options.healthUrl.trim(), source: 'literal', channel: 'vault'};
	}

	if (!options.healthUrlSecret?.trim()) {
		return {url: null, source: 'none', channel: 'vault'};
	}

	const secretRef = parseHealthUrlSecretSpec(options.healthUrlSecret);
	const service = options.domainService ?? secretRef.service;
	const backend = await detectSecretsBackend();

	if (typeof Bun.secrets === 'undefined') {
		logSecretChannel(
			`[secrets] Bun.secrets unavailable — cannot resolve ${secretRef.raw}`,
			backend.platform,
		);
		return {url: null, source: 'secret', secretRef, ...backend, channel: 'vault'};
	}

	try {
		const value = await Bun.secrets.get({service, name: secretRef.name});
		const isolation =
			backend.platform === 'win32' ? ' enterprise-credential-isolation' : '';
		logSecretChannel(
			`[secrets] resolved ${secretRef.raw} via ${backend.backend}${isolation} channel=vault`,
			backend.platform,
		);
		return {
			url: value,
			source: 'secret',
			secretRef: {...secretRef, service},
			...backend,
			channel: 'vault',
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logSecretChannel(
			`[secrets] failed ${secretRef.raw}: ${message}`,
			backend.platform,
		);
		return {url: null, source: 'secret', secretRef, ...backend, channel: 'vault'};
	}
}

function logSecretChannel(message: string, _platform?: string): void {
	console.error(colorize(TERMINAL.primary, message));
}

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