import type {EndpointProbeTarget} from '../intel/endpoint-types.ts';
import type {PolicyDocument, PolicyEndpointProbe} from './types.ts';

function parseEndpointEntry(entry: Record<string, unknown>): EndpointProbeTarget | null {
	const url = typeof entry.url === 'string' ? entry.url : undefined;
	if (!url) return null;

	const method = entry.method === 'HEAD' ? 'HEAD' : entry.method === 'GET' ? 'GET' : undefined;
	const expectStatus =
		typeof entry.expectStatus === 'number' ? entry.expectStatus : undefined;
	const label = typeof entry.label === 'string' ? entry.label : undefined;
	const requireHeaders = Array.isArray(entry.requireHeaders)
		? entry.requireHeaders.filter((h): h is string => typeof h === 'string')
		: undefined;

	return {
		url,
		label,
		method,
		expectStatus,
		requireHeaders: requireHeaders?.length ? requireHeaders : undefined,
	};
}

/** Extract `[[intel.endpoints]]` from a parsed TOML document. */
export function extractEndpointProbesFromToml(parsed: unknown): PolicyEndpointProbe[] {
	if (typeof parsed !== 'object' || parsed === null) {
		return [];
	}

	const intel = (parsed as Record<string, unknown>).intel;
	if (typeof intel !== 'object' || intel === null) {
		return [];
	}

	const endpoints = (intel as Record<string, unknown>).endpoints;
	if (!Array.isArray(endpoints)) {
		return [];
	}

	return endpoints
		.filter(
			(entry): entry is Record<string, unknown> =>
				typeof entry === 'object' && entry !== null && !Array.isArray(entry),
		)
		.map(parseEndpointEntry)
		.filter((entry): entry is EndpointProbeTarget => entry !== null);
}

export function endpointProbesFromDocument(
	doc: PolicyDocument | null | undefined,
): PolicyEndpointProbe[] {
	return doc?.intel?.endpoints ?? [];
}

export function policyEndpointToTarget(probe: PolicyEndpointProbe): EndpointProbeTarget {
	return {...probe};
}

export function mergeEndpointProbeTargets(
	...lists: readonly (readonly EndpointProbeTarget[])[]
): EndpointProbeTarget[] {
	const seen = new Set<string>();
	const out: EndpointProbeTarget[] = [];
	for (const list of lists) {
		for (const target of list) {
			const key = `${target.method ?? 'GET'}:${target.url}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(target);
		}
	}
	return out.sort((a, b) => a.url.localeCompare(b.url));
}