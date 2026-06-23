import type {DoctorIssue} from '../config/doctor.ts';
import type {DomainConfig} from '../config/types.ts';
import type {PolicyDocument} from '../policy/types.ts';
import {extractEndpointProbesFromToml} from '../policy/endpoints.ts';
import {loadProjectPolicies} from '../policy/loader.ts';
import type {NetworkAuditCounts} from './network-audit.ts';
import {resolveAllEndpointProbeTargets} from './endpoint-resolve.ts';
import type {EndpointProbeTarget} from './endpoint-types.ts';
import {scanEndpointMetaProbes} from './endpoint-probe.ts';
import type {EndpointProbeReport} from './endpoint-types.ts';

/** Resolve endpoint probe targets from domain config + security.policy.toml. */
export function resolveEndpointProbeTargets(
	config: DomainConfig,
	policy: PolicyDocument | null | undefined,
): EndpointProbeTarget[] {
	return resolveAllEndpointProbeTargets(config, policy);
}

export {
	bundleEndpointsToProbeTargets,
	resolveAllEndpointProbeTargets,
	resolveRouteProbeUrl,
} from './endpoint-resolve.ts';

/** Deep scan: HTTP meta probes for all resolved service endpoints. */
export async function scanDomainEndpointProbes(options: {
	root: string;
	domain: string;
	config: DomainConfig;
	policy?: PolicyDocument | null;
	healthUrl?: string | null;
	bundleNetwork?: NetworkAuditCounts;
	timeoutMs?: number;
}): Promise<EndpointProbeReport> {
	const policy = options.policy ?? (await loadProjectPolicies(options.root));
	const targets = resolveAllEndpointProbeTargets(options.config, policy, {
		healthUrl: options.healthUrl,
		bundleNetwork: options.bundleNetwork,
	});
	return scanEndpointMetaProbes({
		root: options.root,
		domain: options.domain,
		targets,
		timeoutMs: options.timeoutMs,
	});
}

/** Collect doctor issues from configured endpoint meta probes. */
export async function collectEndpointDoctorIssues(
	root: string,
	domain: string,
	domainPath: string,
	config: DomainConfig,
	policy: PolicyDocument | null | undefined,
): Promise<DoctorIssue[]> {
	const targets = resolveAllEndpointProbeTargets(config, policy);
	if (targets.length === 0) {
		return [];
	}

	const report = await scanEndpointMetaProbes({root, domain, targets});

	return report.violations.map(violation => ({
		domain,
		path: domainPath,
		field: `intel.endpoints.${violation.label ?? violation.url}`,
		message: violation.message,
		severity:
			violation.severity === 'critical' || violation.severity === 'high'
				? 'error'
				: 'warning',
		code: 'ENDPOINT_PROBE',
	}));
}

export {extractEndpointProbesFromToml};