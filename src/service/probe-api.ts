import type {EndpointProbeReport, EndpointProbeTarget} from '../intel/endpoint-types.ts';

export const ENDPOINT_PROBE_META_PATH = '/api/probes/meta';
export const ENDPOINT_PROBE_CATALOG_PATH = '/api/probes/meta/catalog';

export interface EndpointProbeApiContext {
	listTargets: () => EndpointProbeTarget[] | Promise<EndpointProbeTarget[]>;
	runProbes: () => EndpointProbeReport | Promise<EndpointProbeReport>;
}

function jsonResponse(body: unknown, status = 200): Response {
	return Response.json(body, {status});
}

/**
 * Expose read-only HTTP handlers for endpoint meta probe catalog and live results.
 * Returns null when the request path is not a probe API route.
 */
export async function handleEndpointProbeApi(
	req: Request,
	ctx: EndpointProbeApiContext,
): Promise<Response | null> {
	if (req.method !== 'GET') {
		return null;
	}

	const {pathname} = new URL(req.url);
	if (pathname === ENDPOINT_PROBE_CATALOG_PATH) {
		const targets = await ctx.listTargets();
		return jsonResponse({
			path: ENDPOINT_PROBE_CATALOG_PATH,
			count: targets.length,
			targets,
		});
	}

	if (pathname === ENDPOINT_PROBE_META_PATH) {
		const report = await ctx.runProbes();
		return jsonResponse({
			path: ENDPOINT_PROBE_META_PATH,
			...report,
		});
	}

	return null;
}
