import type {DomainConfig} from '../config/types.ts';
import type {PolicyDocument} from '../policy/types.ts';
import {
	endpointProbesFromDocument,
	mergeEndpointProbeTargets,
	policyEndpointToTarget,
} from '../policy/endpoints.ts';
import type {NetworkAuditCounts} from './network-audit.ts';
import type {EndpointProbeTarget} from './endpoint-types.ts';

const META_ROUTE = /\/meta\b/i;
const HEALTH_ROUTE = /\/(?:healthz?|readyz?|livez?|status|ping)\b/i;

/** Resolve a bundle route or relative path against a health/base URL. */
export function resolveRouteProbeUrl(route: string, baseUrl: string): string | null {
	try {
		if (route.startsWith('http://') || route.startsWith('https://')) {
			return route;
		}
		const base = new URL(baseUrl);
		if (route.startsWith('/')) {
			return `${base.origin}${route}`;
		}
		return new URL(route, base).href;
	} catch {
		return null;
	}
}

function labelForBundleRoute(route: string): string {
	if (META_ROUTE.test(route)) return 'meta';
	if (HEALTH_ROUTE.test(route)) return 'health';
	return 'bundle-route';
}

function domainEndpointTargets(config: DomainConfig): EndpointProbeTarget[] {
	return (config.intel?.endpoints ?? []).map(target => ({...target}));
}

/** Turn bundle audit endpoints into probe targets (absolute URLs + routes under health origin). */
export function bundleEndpointsToProbeTargets(
	bundle: NetworkAuditCounts,
	healthUrl?: string | null,
): EndpointProbeTarget[] {
	const targets: EndpointProbeTarget[] = [];

	for (const endpoint of bundle.endpoints) {
		if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
			targets.push({
				url: endpoint,
				label: labelForBundleRoute(endpoint),
				method: 'GET',
				expectStatus: META_ROUTE.test(endpoint) || HEALTH_ROUTE.test(endpoint) ? 200 : undefined,
			});
			continue;
		}

		if (!healthUrl || !endpoint.startsWith('/')) continue;
		const url = resolveRouteProbeUrl(endpoint, healthUrl);
		if (!url) continue;
		const label = labelForBundleRoute(endpoint);
		targets.push({
			url,
			label,
			method: 'GET',
			expectStatus: label === 'meta' || label === 'health' ? 200 : undefined,
		});
	}

	for (const route of bundle.healthRoutes) {
		if (route.startsWith('http://') || route.startsWith('https://')) {
			targets.push({
				url: route,
				label: labelForBundleRoute(route),
				method: 'GET',
				expectStatus: 200,
			});
			continue;
		}
		if (!healthUrl) continue;
		const url = resolveRouteProbeUrl(route, healthUrl);
		if (!url) continue;
		targets.push({
			url,
			label: labelForBundleRoute(route),
			method: 'GET',
			expectStatus: 200,
		});
	}

	return targets;
}

function healthUrlTarget(healthUrl: string): EndpointProbeTarget {
	return {
		url: healthUrl,
		label: 'health',
		method: 'GET',
		expectStatus: 200,
	};
}

/**
 * Merge domain, policy, health URL, and bundle-discovered endpoints into one probe set.
 */
export function resolveAllEndpointProbeTargets(
	config: DomainConfig,
	policy: PolicyDocument | null | undefined,
	options: {
		healthUrl?: string | null;
		bundleNetwork?: NetworkAuditCounts;
	} = {},
): EndpointProbeTarget[] {
	const lists: EndpointProbeTarget[][] = [
		domainEndpointTargets(config),
		endpointProbesFromDocument(policy).map(policyEndpointToTarget),
	];

	if (options.healthUrl) {
		lists.push([healthUrlTarget(options.healthUrl)]);
	}
	if (options.bundleNetwork) {
		lists.push(bundleEndpointsToProbeTargets(options.bundleNetwork, options.healthUrl));
	}

	return mergeEndpointProbeTargets(...lists);
}