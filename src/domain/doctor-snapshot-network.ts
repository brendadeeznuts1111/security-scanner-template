import {statSync} from 'fs';
import path from 'path';
import type {DomainConfig} from '../config/types.ts';
import {auditBundleNetwork} from '../intel/network-audit.ts';
import {loadNetworkBaseline, type NetworkHealthStatus} from '../intel/network-baseline.ts';
import {resolveHealthUrl} from '../network/health-secrets.ts';
import {probeNetworkHealth} from '../network/probe.ts';
import {resolveNetworkConfig} from '../network/resolve-config.ts';

export interface DoctorSnapshotNetworkMeta {
	enabled: boolean;
	/** Relative dist path from project root when enabled. */
	distPath?: string;
	/** On-disk network baseline exists at the resolved path. */
	baselinePresent: boolean;
	/** Sorted unique endpoints from bundle scan. */
	endpoints: string[];
	/** Sorted health-like routes from bundle scan. */
	healthRoutes: string[];
	/** Aggregate health at capture time; unknown when not probed. */
	health: NetworkHealthStatus;
	/** Whether the dist directory was scanned successfully. */
	scanned: boolean;
}

export const EMPTY_NETWORK_SNAPSHOT: DoctorSnapshotNetworkMeta = {
	enabled: false,
	baselinePresent: false,
	endpoints: [],
	healthRoutes: [],
	health: 'unknown',
	scanned: false,
};

function mapProbeStatus(status: 'healthy' | 'degraded' | 'unreachable'): NetworkHealthStatus {
	if (status === 'unreachable') return 'unhealthy';
	return status;
}

/** Capture bundle endpoints, baseline presence, and optional health for doctor snapshots. */
export async function collectDoctorNetworkSnapshot(
	root: string,
	domainName: string,
	config: DomainConfig,
): Promise<DoctorSnapshotNetworkMeta> {
	const networkLayer = config.service?.network;
	if (!networkLayer?.enabled) {
		return {...EMPTY_NETWORK_SNAPSHOT};
	}

	const resolved = resolveNetworkConfig({
		domain: domainName,
		projectRoot: root,
		network: networkLayer,
		domainConfig: config,
	});

	let distKind: 'file' | 'directory' | 'missing' = 'missing';
	try {
		const stat = statSync(resolved.resolvedDistPath);
		distKind = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'missing';
	} catch {
		distKind = 'missing';
	}

	let endpoints: string[] = [];
	let healthRoutes: string[] = [];
	let scanned = false;

	if (distKind !== 'missing') {
		const audit = await auditBundleNetwork(resolved.resolvedDistPath);
		endpoints = audit.endpoints;
		healthRoutes = audit.healthRoutes;
		scanned = audit.endpoints.length > 0 || audit.healthRoutes.length > 0 || audit.raw > 0;
	}

	const baseline = await loadNetworkBaseline(resolved.resolvedBaselinePath);
	const baselinePresent = baseline !== null;

	let health: NetworkHealthStatus = 'unknown';
	const healthResolution = await resolveHealthUrl({
		domain: domainName,
		healthUrl: resolved.healthUrl,
		healthUrlSecret: resolved.healthUrlSecret,
	});
	if (healthResolution.url) {
		const probe = await probeNetworkHealth(healthResolution.url, 5_000);
		health = mapProbeStatus(probe.status);
	}

	return {
		enabled: true,
		distPath: path.relative(root, resolved.resolvedDistPath) || resolved.distPath,
		baselinePresent,
		endpoints,
		healthRoutes,
		health,
		scanned,
	};
}
