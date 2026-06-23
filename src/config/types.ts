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
	/** Optional bcrypt cost (4-31). Ignored for argon2 algorithms. */
	cost?: number;
}

export interface DomainToken {
	algorithm: string;
	ttlSeconds: number;
	issuer: string;
}

export type CsrfMode = 'stateless' | 'session-bound';

export type CsrfEncoding = 'base64' | 'base64url' | 'hex';

export type CsrfAlgorithm =
	| 'blake2b256'
	| 'blake2b512'
	| 'sha256'
	| 'sha384'
	| 'sha512'
	| 'sha512-256';

export interface DomainCsrf {
	enabled: boolean;
	tokenLength: number;
	/** Stateless or session-bound tokens via Bun.CSRF. */
	mode?: CsrfMode;
	cookieName?: string;
	headerName?: string;
	sessionCookieName?: string;
	/** Token encoding passed to Bun.CSRF.generate / verify. */
	encoding?: CsrfEncoding;
	/** Hash algorithm passed to Bun.CSRF.generate / verify. */
	algorithm?: CsrfAlgorithm;
	/** Token TTL in ms (Bun.CSRF expiresIn). Default: 24 hours. */
	expiresIn?: number;
	/** Max token age in ms for verify (Bun.CSRF maxAge). Defaults to expiresIn. */
	maxAge?: number;
}

/** HTTP client protocol for threat-feed downloads (Bun fetch experimental). */
export type FeedFetchProtocol = 'http2' | 'http3';

export interface DomainFeed {
	remote?: string;
	local?: string;
	apiKeyVault?: string;
	apiKeyService?: string;
	cachePath?: string;
	cacheTtl?: number;
	/** Prefer HTTP/2 or HTTP/3 for remote feed fetches. */
	protocol?: FeedFetchProtocol;
}

export interface DomainSupplyChain {
	enabled: boolean;
	feed: DomainFeed;
	policy: {
		fatal: string[];
		warn: string[];
	};
}

export interface DomainReportOperatorQr {
	/** Embed domain vault QR in HTML reports (default: true). */
	enabled?: boolean;
	size?: number;
	dark?: string;
	light?: string;
}

export interface DomainOpsReport {
	format: string;
	output: string;
	operatorQr?: DomainReportOperatorQr;
}

export interface DomainVisualQr {
	/** Master-token QR generation via `bun sp qr` (default: true). */
	enabled?: boolean;
}

export interface DomainVisual {
	qr?: DomainVisualQr;
}

export interface DomainOps {
	watch: {
		debounceMs: number;
		report?: string | null;
		output?: string | null;
	};
	report: DomainOpsReport;
}

export interface DomainServiceTls {
	cert: string;
	key: string;
	ca?: string;
}

export interface DomainService {
	/**
	 * Enable Bun.Terminal PTY for external scanner orchestration (`scan interactive`, REPL `scan`).
	 * Requires stdin and stdout TTYs; use JSON CLIs when piping output.
	 */
	interactive?: boolean;
	/** Listen port for `bun sp start` / Service.start(). */
	port?: number;
	hostname?: string;
	/** Enable QUIC / HTTP/3 via Bun.serve({ http3: true }). Requires TLS. */
	http3?: boolean;
	/** Serve HTTP/1.1 alongside HTTP/3 (default true). */
	http1?: boolean;
	tls?: DomainServiceTls;
}

export interface DomainAuditConfig {
	sqlite?: {
		path: string;
		masterKey?: string | null;
		compress?: boolean;
		compressionFormat?: 'gzip' | 'zstd';
	};
}

export interface DomainIntelConfig {
	dns?: {
		blocklist?: string[];
		requireResolution?: boolean;
		suspiciousTtlThreshold?: number;
	};
}

/** Client-side TLS inspection settings (remote endpoint scans). */
export interface DomainTlsConfig {
	/**
	 * Validate remote TLS against the OS trust store (`tls.getCACertificates('system')`).
	 * Omit to auto-enable when the runtime exposes system CAs (Bun >= 1.3.14).
	 * Set `false` to skip; set `true` to force validation.
	 */
	useSystemCA?: boolean;
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
	/** Visual artifacts (QR, report thumbnails). */
	visual?: DomainVisual;
	service?: DomainService;
	audit?: DomainAuditConfig;
	intel?: DomainIntelConfig;
	/** Remote TLS inspection defaults for \`bun sp tls\` / \`bun scan tls\`. */
	tls?: DomainTlsConfig;
	errorOverrides: Record<string, ErrorOverride>;
}

export interface LoadedDomain {
	domain: string;
	path: string;
	config: DomainConfig;
}
