import type {NetworkBaselineDelta} from '../intel/network-baseline.ts';
import type {NetworkHealthStatus} from '../intel/network-baseline.ts';

export type NetworkNdjsonEventType = 'initial' | 'probe' | 'watch' | 'tick' | 'audit';

export interface NetworkNdjsonEvent {
	ts: string;
	type: NetworkNdjsonEventType;
	domain: string;
	networkUnique: number;
	networkRaw: number;
	endpoints: number;
	routes: number;
	health: NetworkHealthStatus | 'unreachable' | 'unknown';
	probes: number;
	probesOk: number;
	latency: number;
	patterns?: number;
	semver?: number;
	file?: string;
	deltaEndpoints?: number;
	deltaRoutes?: number;
	baselineDrift?: boolean;
}

export function formatNetworkNdjsonLine(event: NetworkNdjsonEvent): string {
	return `${JSON.stringify(event)}\n`;
}

export function buildNetworkNdjsonEvent(input: {
	type: NetworkNdjsonEventType;
	domain: string;
	networkUnique: number;
	networkRaw: number;
	endpoints: number;
	healthRoutes: number;
	health: NetworkHealthStatus | 'unreachable' | 'unknown';
	probesOk: number;
	probesTotal: number;
	latencyMs: number;
	patternMatches?: number;
	semverViolations?: number;
	trigger?: string;
	delta?: NetworkBaselineDelta;
}): NetworkNdjsonEvent {
	const event: NetworkNdjsonEvent = {
		ts: new Date().toISOString(),
		type: input.type,
		domain: input.domain,
		networkUnique: input.networkUnique,
		networkRaw: input.networkRaw,
		endpoints: input.endpoints,
		routes: input.healthRoutes,
		health: input.health,
		probes: input.probesTotal,
		probesOk: input.probesOk,
		latency: input.latencyMs,
	};
	if (input.patternMatches != null) event.patterns = input.patternMatches;
	if (input.semverViolations != null) event.semver = input.semverViolations;
	if (input.trigger) event.file = input.trigger;
	if (input.delta) {
		event.deltaEndpoints =
			input.delta.endpoints.added.length - input.delta.endpoints.removed.length;
		event.deltaRoutes = input.delta.healthRoutes.added.length;
		event.baselineDrift = input.delta.hasEndpointDrift;
	}
	return event;
}
