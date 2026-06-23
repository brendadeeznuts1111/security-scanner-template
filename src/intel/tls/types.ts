export interface TLSCertificateSummary {
	subject: Record<string, string>;
	issuer: Record<string, string>;
	validFrom: string;
	validTo: string;
	fingerprint: string;
	serialNumber: string;
	daysRemaining: number;
	expired: boolean;
	selfSigned: boolean;
}

export interface TLSCipherSummary {
	name: string;
	standardName?: string;
	version?: string;
}

export interface TLSProfile {
	host: string;
	port: number;
	protocol?: string;
	alpn?: string | false | null;
	cipher?: TLSCipherSummary;
	certificate?: TLSCertificateSummary;
	/** Present when `useSystemCA` validation ran. */
	trusted?: boolean;
	trustError?: string;
	validatedWithSystemCA: boolean;
	/** Full chain when `deep: true`. */
	chain?: TLSCertificateSummary[];
}

export interface TLSInspectOptions {
	useSystemCA?: boolean;
	deep?: boolean;
	timeoutMs?: number;
	/** Test hook — override `tls.connect`. */
	connectFn?: typeof import('node:tls').connect;
}