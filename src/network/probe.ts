import type {NetworkHealthProbeResult, NetworkHealthStatus} from './types.ts';

function resolveHealthStatus(ok: boolean, reachable: boolean): NetworkHealthStatus {
	if (!reachable) return 'unreachable';
	return ok ? 'healthy' : 'degraded';
}

/** Probe a single health endpoint URL (exported for tests). */
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
			probesOk: response.ok ? 1 : 0,
			probesTotal: 1,
		};
	} catch {
		return {
			status: 'unreachable',
			latencyMs: Math.round(performance.now() - start),
			probesOk: 0,
			probesTotal: 1,
		};
	} finally {
		clearTimeout(timer);
	}
}