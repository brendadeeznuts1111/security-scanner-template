export type NetworkHealthStatus = 'healthy' | 'degraded' | 'unreachable';

export interface NetworkHealthProbeResult {
	status: NetworkHealthStatus;
	latencyMs: number;
	statusCode?: number;
}

export interface NetworkAuditSummary {
	domain: string;
	timestamp: string;
	patternMatches: number;
	semverViolations: number;
	bundleEndpoints?: number;
	bundleHealthRoutes?: number;
	healthStatus?: NetworkHealthStatus;
	healthLatencyMs?: number;
}

export interface NetworkLoopStatus {
	running: boolean;
	domain: string;
	distPath: string;
	healthUrl?: string;
	probeIntervalMs: number;
	watchEnabled: boolean;
	watchIntervalMs: number;
	lastAuditAt?: string;
	lastDistHash?: string;
	probeCount: number;
	auditCount: number;
}