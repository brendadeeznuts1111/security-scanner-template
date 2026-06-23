import type {DomainConfig} from '../config/types.ts';
import {DEFAULT_CHANNELS, DEFAULT_COLORS} from '../config/defaults.ts';
import {colorize} from '../color/index.ts';
import {shouldColorize} from '../utils/process.ts';
import type {NetworkHealthStatus} from '../intel/network-baseline.ts';

export interface NetworkLoopColorMatrix {
	network: string;
	endpoints: string;
	health: string;
	perf: string;
	muted: string;
}

export function resolveNetworkLoopColors(config?: DomainConfig | null): NetworkLoopColorMatrix {
	const colors = config?.colors ?? DEFAULT_COLORS;
	const channels = config?.channels ?? DEFAULT_CHANNELS;
	return {
		network: channels.supplyChain,
		endpoints: colors.info,
		health: colors.success,
		perf: colors.secondary,
		muted: channels.ops,
	};
}

export function healthStatusColor(
	status: NetworkHealthStatus,
	matrix: NetworkLoopColorMatrix,
): string {
	switch (status) {
		case 'healthy':
			return matrix.health;
		case 'degraded':
			return DEFAULT_COLORS.warn;
		case 'unhealthy':
			return DEFAULT_COLORS.fatal;
		default:
			return matrix.muted;
	}
}

export interface NetworkLoopStatusInput {
	phase: 'initial' | 'watch' | 'tick';
	networkUnique: number;
	networkRaw: number;
	endpoints: number;
	healthRoutes: number;
	health: NetworkHealthStatus;
	probesOk: number;
	probesTotal: number;
	latencyMs: number;
	deltaLine?: string;
}

/** Format `[loop]` stderr dashboard line with domain-scoped Bun.color segments. */
export function formatNetworkLoopStatusLine(
	input: NetworkLoopStatusInput,
	matrix: NetworkLoopColorMatrix = resolveNetworkLoopColors(),
): string {
	const useColor = shouldColorize();
	const paint = (color: string, text: string) => (useColor ? colorize(color, text) : text);

	const prefix = paint(matrix.muted, '[loop]');
	const phase = paint(matrix.muted, ` ${input.phase}`);
	const network = paint(
		matrix.network,
		` network=${input.networkUnique}unique/${input.networkRaw}raw`,
	);
	const endpoints = paint(matrix.endpoints, ` endpoints=${input.endpoints}`);
	const routes = paint(matrix.endpoints, ` health_routes=${input.healthRoutes}`);
	const health = paint(
		healthStatusColor(input.health, matrix),
		` health=${input.health}`,
	);
	const probes = paint(
		matrix.network,
		` probes=${input.probesOk}/${input.probesTotal}`,
	);
	const latency = paint(matrix.perf, ` latency=${input.latencyMs}ms`);
	const delta = input.deltaLine ? ` ${paint(matrix.muted, input.deltaLine)}` : '';

	return `${prefix}${phase}${network}${endpoints}${routes}${health}${probes}${latency}${delta}`;
}