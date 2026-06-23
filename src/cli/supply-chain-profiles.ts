/** Layer 4.5 supply-chain scan profiles (transpiler rule subsets). */
export type SupplyChainScanProfile =
	| 'supply-chain-network'
	| 'supply-chain-secrets'
	| 'supply-chain-full';

export interface SupplyChainScanProfileSpec {
	description: string;
	rules?: string[];
	/** Scan built bundle output via Bun.Transpiler rules. */
	includeBundle?: boolean;
	/** Scan installed deps against security.policy.toml semver/threat rules. */
	includePackages?: boolean;
	/** Scan licenses, sources, and blocked imports from policy. */
	includeConstraints?: boolean;
	/** When true, run import constraint scan against project source. */
	scanImports?: boolean;
}

export const SUPPLY_CHAIN_SCAN_PROFILES: Record<
	SupplyChainScanProfile,
	SupplyChainScanProfileSpec
> = {
	'supply-chain-network': {
		description: 'Bundle network egress patterns plus policy package/import constraints',
		rules: ['remote-import', 'child-process'],
		includeBundle: true,
		includePackages: true,
		includeConstraints: true,
		scanImports: true,
	},
	'supply-chain-secrets': {
		description: 'Hardcoded credentials and unsafe eval in bundles',
		rules: ['hardcoded-secret', 'unsafe-eval', 'function-constructor'],
		includeBundle: true,
		includePackages: false,
		includeConstraints: false,
	},
	'supply-chain-full': {
		description: 'Bundle, installed packages, and full policy constraints',
		includeBundle: true,
		includePackages: true,
		includeConstraints: true,
		scanImports: true,
	},
};

export function isSupplyChainScanProfile(value: string): value is SupplyChainScanProfile {
	return value in SUPPLY_CHAIN_SCAN_PROFILES;
}

export function resolveSupplyChainProfile(
	profile: string | undefined,
): SupplyChainScanProfileSpec & {name: SupplyChainScanProfile | 'default'} {
	if (profile && isSupplyChainScanProfile(profile)) {
		return {name: profile, ...SUPPLY_CHAIN_SCAN_PROFILES[profile]};
	}
	return {
		name: 'default',
		description: 'Default bundle transpiler scan (all rules)',
		includeBundle: true,
		includePackages: false,
		includeConstraints: false,
	};
}