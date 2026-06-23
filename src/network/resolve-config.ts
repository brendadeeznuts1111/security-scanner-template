import path from 'path';
import {DEFAULT_NETWORK_CONFIG} from '../config/defaults.ts';
import type {DomainConfig, DomainNetworkConfig} from '../config/types.ts';
import {defaultNetworkBaselinePath} from '../intel/network-baseline.ts';

export interface NetworkConfigOverrides {
	healthUrl?: string;
	healthUrlSecret?: string;
	/** Resolved baseline path (CLI `--baseline`). */
	baselinePath?: string;
	/** Alias for baselinePath (CLI shorthand). */
	baseline?: string;
	updateBaseline?: boolean;
	failOnHealth?: boolean;
	failOnDrift?: boolean;
	json?: boolean;
	herdrTab?: boolean;
	noColor?: boolean;
	distPath?: string;
	probeInterval?: number;
	watch?: boolean;
	watchInterval?: number;
	debounceMs?: number;
}

export interface ResolvedNetworkConfig {
	enabled: boolean;
	distPath: string;
	resolvedDistPath: string;
	healthUrl?: string;
	healthUrlSecret?: string;
	baselinePath: string;
	resolvedBaselinePath: string;
	updateBaseline: boolean;
	probeInterval: number;
	watch: boolean;
	watchInterval: number;
	debounceMs: number;
	failOnHealth: boolean;
	failOnDrift: boolean;
	json: boolean;
	herdrTab: boolean;
	noColor: boolean;
}

function mergeNetworkLayer(
	base: DomainNetworkConfig,
	overrides: NetworkConfigOverrides,
): DomainNetworkConfig {
	return {
		...base,
		healthUrl: overrides.healthUrl ?? base.healthUrl,
		healthUrlSecret: overrides.healthUrlSecret ?? base.healthUrlSecret,
		baselinePath: overrides.baselinePath ?? overrides.baseline ?? base.baselinePath,
		updateBaseline: overrides.updateBaseline ?? base.updateBaseline,
		failOnHealth: overrides.failOnHealth ?? base.failOnHealth,
		failOnDrift: overrides.failOnDrift ?? base.failOnDrift,
		json: overrides.json ?? base.json,
		herdrTab: overrides.herdrTab ?? base.herdrTab,
		noColor: overrides.noColor ?? base.noColor,
		distPath: overrides.distPath ?? base.distPath,
		probeInterval: overrides.probeInterval ?? base.probeInterval,
		watch: overrides.watch ?? base.watch,
		watchInterval: overrides.watchInterval ?? base.watchInterval,
		debounceMs: overrides.debounceMs ?? base.debounceMs,
	};
}

/**
 * Merge domain JSON5 `service.network` with CLI overrides into resolved paths.
 */
export function resolveNetworkConfig(input: {
	domain: string;
	projectRoot: string;
	network?: DomainNetworkConfig | null;
	domainConfig?: DomainConfig | null;
	overrides?: NetworkConfigOverrides;
	/** Absolute dist path from `--path` (supply-chain network loop). */
	distPathOverride?: string;
}): ResolvedNetworkConfig {
	const base = mergeNetworkLayer(
		{...DEFAULT_NETWORK_CONFIG, ...input.network},
		input.overrides ?? {},
	);

	const debounceMs =
		input.overrides?.debounceMs ??
		input.network?.debounceMs ??
		input.domainConfig?.ops?.watch?.debounceMs ??
		DEFAULT_NETWORK_CONFIG.debounceMs!;

	const distPath = base.distPath ?? DEFAULT_NETWORK_CONFIG.distPath!;
	const resolvedDistPath = input.distPathOverride
		? path.resolve(input.distPathOverride)
		: path.resolve(input.projectRoot, distPath);

	const baselinePath =
		base.baselinePath ?? defaultNetworkBaselinePath(input.domain, input.projectRoot);
	const resolvedBaselinePath = path.isAbsolute(baselinePath)
		? baselinePath
		: path.resolve(input.projectRoot, baselinePath);

	return {
		enabled: base.enabled,
		distPath,
		resolvedDistPath,
		healthUrl: base.healthUrl,
		healthUrlSecret: base.healthUrlSecret,
		baselinePath,
		resolvedBaselinePath,
		updateBaseline: base.updateBaseline ?? false,
		probeInterval: base.probeInterval ?? DEFAULT_NETWORK_CONFIG.probeInterval!,
		watch: base.watch ?? DEFAULT_NETWORK_CONFIG.watch!,
		watchInterval: base.watchInterval ?? DEFAULT_NETWORK_CONFIG.watchInterval!,
		debounceMs,
		failOnHealth: base.failOnHealth ?? false,
		failOnDrift: base.failOnDrift ?? false,
		json: base.json ?? false,
		herdrTab: base.herdrTab ?? false,
		noColor: base.noColor ?? false,
	};
}

/** Map resolved config to NetworkLoop constructor options. */
export function resolvedNetworkToLoopOptions(resolved: ResolvedNetworkConfig): Pick<
	ResolvedNetworkConfig,
	| 'healthUrl'
	| 'healthUrlSecret'
	| 'resolvedBaselinePath'
	| 'updateBaseline'
	| 'probeInterval'
	| 'watch'
	| 'watchInterval'
	| 'failOnHealth'
	| 'failOnDrift'
	| 'json'
	| 'herdrTab'
	| 'noColor'
> & {
	baselinePath: string;
	distPath: string;
	emitJson: boolean;
	emitHerdrTab: boolean;
} {
	return {
		distPath: resolved.resolvedDistPath,
		healthUrl: resolved.healthUrl,
		healthUrlSecret: resolved.healthUrlSecret,
		baselinePath: resolved.resolvedBaselinePath,
		resolvedBaselinePath: resolved.resolvedBaselinePath,
		updateBaseline: resolved.updateBaseline,
		probeInterval: resolved.probeInterval,
		watch: resolved.watch,
		watchInterval: resolved.watchInterval,
		failOnHealth: resolved.failOnHealth,
		failOnDrift: resolved.failOnDrift,
		json: resolved.json,
		herdrTab: resolved.herdrTab,
		noColor: resolved.noColor,
		emitJson: resolved.json,
		emitHerdrTab: resolved.herdrTab,
	};
}
