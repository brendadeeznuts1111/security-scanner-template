import type {NetworkBaselineDelta} from '../intel/network-baseline.ts';

export type NetworkHealthStatus = 'healthy' | 'degraded' | 'unreachable';

export interface NetworkHealthProbeResult {
	status: NetworkHealthStatus;
	latencyMs: number;
	probesOk?: number;
	probesTotal?: number;
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
	delta?: NetworkBaselineDelta;
}

export interface NetworkLoopStatus {
	running: boolean;
	domain: string;
	distPath: string;
	healthUrl?: string;
	healthUrlSecret?: string;
	baselinePath?: string;
	probeIntervalMs: number;
	watchEnabled: boolean;
	watchIntervalMs: number;
	lastAuditAt?: string;
	lastDistHash?: string;
	probeCount: number;
	auditCount: number;
	failOnHealth: boolean;
	failOnDrift: boolean;
	emitJson: boolean;
	emitHerdrTab: boolean;
}
