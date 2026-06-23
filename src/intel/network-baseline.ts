import path from 'path';
import {reverseDnsPathSegment} from '../domain/branding.ts';
import {parseJson5File, writeJson5File} from '../utils/json5-config.ts';

export const NETWORK_BASELINE_VERSION = 1;
export const NETWORK_BASELINE_FILENAME = 'network-baseline.json5';

export interface NetworkBaselineDocument {
	version: typeof NETWORK_BASELINE_VERSION;
	domain: string;
	capturedAt: string;
	bundlePath: string;
	endpoints: string[];
	healthRoutes: string[];
	health: NetworkHealthStatus;
}

export type NetworkHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface NetworkBaselineDelta {
	endpoints: {added: string[]; removed: string[]};
	healthRoutes: {added: string[]; removed: string[]};
	health: 'stable' | 'changed' | 'degraded';
	hasEndpointDrift: boolean;
}

export function defaultNetworkBaselinePath(domain: string, root: string): string {
	return path.join(root, '.security', reverseDnsPathSegment(domain), NETWORK_BASELINE_FILENAME);
}

export async function loadNetworkBaseline(
	filePath: string,
): Promise<NetworkBaselineDocument | null> {
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		return null;
	}
	try {
		const parsed = await parseJson5File<NetworkBaselineDocument>(filePath);
		if (!Array.isArray(parsed.endpoints) || !Array.isArray(parsed.healthRoutes)) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

export async function saveNetworkBaseline(
	filePath: string,
	document: NetworkBaselineDocument,
): Promise<void> {
	await writeJson5File(filePath, document, {indent: 2});
}

function diffList(
	baseline: readonly string[],
	current: readonly string[],
): {
	added: string[];
	removed: string[];
} {
	const baseSet = new Set(baseline);
	const curSet = new Set(current);
	return {
		added: current.filter(item => !baseSet.has(item)),
		removed: baseline.filter(item => !curSet.has(item)),
	};
}

export function diffNetworkBaseline(
	baseline: NetworkBaselineDocument,
	current: {
		endpoints: readonly string[];
		healthRoutes: readonly string[];
		health: NetworkHealthStatus;
	},
): NetworkBaselineDelta {
	const endpoints = diffList(baseline.endpoints, current.endpoints);
	const healthRoutes = diffList(baseline.healthRoutes, current.healthRoutes);
	const hasEndpointDrift = endpoints.added.length > 0 || endpoints.removed.length > 0;
	const healthChanged = baseline.health !== current.health;
	let health: NetworkBaselineDelta['health'] = 'stable';
	if (healthChanged && current.health === 'degraded') {
		health = 'degraded';
	} else if (healthChanged || hasEndpointDrift || healthRoutes.added.length > 0) {
		health = 'changed';
	}
	return {
		endpoints,
		healthRoutes,
		health,
		hasEndpointDrift,
	};
}

export function formatNetworkBaselineDelta(delta: NetworkBaselineDelta, trigger?: string): string {
	const parts = [
		`Δ endpoints +${delta.endpoints.added.length}/-${delta.endpoints.removed.length}`,
		`Δ routes +${delta.healthRoutes.added.length}`,
		`health=${delta.health}`,
	];
	if (trigger) {
		parts.unshift(`watch (${trigger})`);
	}
	return parts.join('  ');
}
