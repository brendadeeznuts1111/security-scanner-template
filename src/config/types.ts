export interface DomainColors {
	primary: string;
	secondary: string;
	fatal: string;
	warn: string;
	info: string;
	success: string;
}

export interface DomainChannels {
	vault: string;
	identity: string;
	token: string;
	csrf: string;
	supplyChain: string;
	ops: string;
}

export interface SecretEntry {
	name: string;
	required: boolean;
	description?: string;
}

export interface DomainSecrets {
	service: string;
	allowUnrestrictedAccess: boolean;
	/** Inline secret inventory ( discouraged for committed configs). */
	inventory: SecretEntry[];
	/** Path to a separate inventory file. If it ends with `.enc`, it will be decrypted with VAULT_MASTER_KEY. */
	inventoryFile?: string;
}

export interface DomainIdentity {
	algorithm: string;
	minLength: number;
	requireSpecialChar: boolean;
}

export interface DomainToken {
	algorithm: string;
	ttlSeconds: number;
	issuer: string;
}

export interface DomainCsrf {
	enabled: boolean;
	tokenLength: number;
}

export interface DomainFeed {
	remote?: string;
	local?: string;
	apiKeyVault?: string;
	apiKeyService?: string;
	cachePath?: string;
	cacheTtl?: number;
}

export interface DomainSupplyChain {
	enabled: boolean;
	feed: DomainFeed;
	policy: {
		fatal: string[];
		warn: string[];
	};
}

export interface DomainOps {
	watch: {
		debounceMs: number;
		report?: string | null;
		output?: string | null;
	};
	report: {
		format: string;
		output: string;
	};
}

export interface ErrorOverride {
	severity?: string;
	channel?: string;
}

export interface DomainConfig {
	domain: string;
	displayName?: string;
	description?: string;
	colors: DomainColors;
	channels: DomainChannels;
	secrets: DomainSecrets;
	identity: DomainIdentity;
	token: DomainToken;
	csrf: DomainCsrf;
	supplyChain: DomainSupplyChain;
	ops: DomainOps;
	errorOverrides: Record<string, ErrorOverride>;
}

export interface LoadedDomain {
	domain: string;
	path: string;
	config: DomainConfig;
}
