import type {DomainConfig} from '../config/types.ts';
import {DEFAULT_CHANNELS, DEFAULT_COLORS} from '../config/defaults.ts';
import {colorize} from '../color/index.ts';
import {shouldColorize} from '../utils/process.ts';
import type {NetworkHealthStatus} from '../intel/network-baseline.ts';

/** Semantic dashboard colors (hex bases; converted via Bun.color when TTY). */
export const NETWORK_COLOR_MAP = {
	network: {base: '#38bdf8', ansi: 'cyan'},
	endpoints: {base: '#a78bfa', ansi: 'magenta'},
	routes: {base: '#34d399', ansi: 'green'},
	health: {base: '#fbbf24', ansi: 'yellow'},
	latency: {base: '#22d3ee', ansi: 'cyan'},
	delta: {base: '#fb923c', ansi: 'orange'},
	muted: {base: '#8E8E93', ansi: 'gray'},
} as const;

export interface NetworkLoopColorMatrix {
	network: string;
	endpoints: string;
	routes: string;
	health: string;
	latency: string;
	delta: string;
	muted: string;
}

export function resolveNetworkLoopColors(
	config?: DomainConfig | null,
	noColor = false,
): NetworkLoopColorMatrix {
	if (noColor) {
		return {
			network: '',
			endpoints: '',
			routes: '',
			health: '',
			latency: '',
			delta: '',
			muted: '',
		};
	}
	const colors = config?.colors ?? DEFAULT_COLORS;
	const channels = config?.channels ?? DEFAULT_CHANNELS;
	return {
		network: channels.supplyChain || NETWORK_COLOR_MAP.network.base,
		endpoints: NETWORK_COLOR_MAP.endpoints.base,
		routes: NETWORK_COLOR_MAP.routes.base,
		health: colors.success || NETWORK_COLOR_MAP.health.base,
		latency: NETWORK_COLOR_MAP.latency.base,
		delta: NETWORK_COLOR_MAP.delta.base,
		muted: channels.ops || NETWORK_COLOR_MAP.muted.base,
	};
}

export function healthStatusColor(
	status: NetworkHealthStatus | 'unreachable',
	matrix: NetworkLoopColorMatrix,
): string {
	switch (status) {
		case 'healthy':
			return matrix.health;
		case 'degraded':
			return DEFAULT_COLORS.warn;
		case 'unhealthy':
		case 'unreachable':
			return DEFAULT_COLORS.fatal;
		default:
			return matrix.muted;
	}
}

export interface NetworkLoopStatusInput {
	phase: 'initial' | 'watch' | 'probe' | 'tick';
	networkUnique: number;
	networkRaw: number;
	endpoints: number;
	healthRoutes: number;
	health: NetworkHealthStatus | 'unreachable' | 'unknown';
	probesOk: number;
	probesTotal: number;
	latencyMs: number;
	deltaLine?: string;
}

function paintSegment(color: string, text: string, enabled: boolean): string {
	if (!enabled || !color) return text;
	try {
		const ansi = Bun.color(color, 'ansi') ?? colorize(color, text);
		if (typeof ansi === 'string' && ansi.includes(text)) {
			return ansi;
		}
		return colorize(color, text);
	} catch {
		return colorize(color, text);
	}
}

/** Format `[loop]` stderr dashboard line with semantic Bun.color segments. */
export function formatNetworkLoopStatusLine(
	input: NetworkLoopStatusInput,
	matrix: NetworkLoopColorMatrix = resolveNetworkLoopColors(),
	noColor = false,
): string {
	const useColor = !noColor && shouldColorize();
	const paint = (color: string, text: string) => paintSegment(color, text, useColor);

	const prefix = paint(matrix.muted, '[loop]');
	const phase = paint(matrix.muted, ` ${input.phase}`);
	const network = paint(
		matrix.network,
		` network=${input.networkUnique}unique/${input.networkRaw}raw`,
	);
	const endpoints = paint(matrix.endpoints, ` endpoints=${input.endpoints}`);
	const routes = paint(matrix.routes, ` health_routes=${input.healthRoutes}`);
	const health = paint(healthStatusColor(input.health, matrix), ` health=${input.health}`);
	const probes = paint(matrix.network, ` probes=${input.probesOk}/${input.probesTotal}`);
	const latency = paint(matrix.latency, ` latency=${input.latencyMs}ms`);
	const delta = input.deltaLine ? ` ${paint(matrix.delta, input.deltaLine)}` : '';

	return `${prefix}${phase}${network}${endpoints}${routes}${health}${probes}${latency}${delta}`;
}
