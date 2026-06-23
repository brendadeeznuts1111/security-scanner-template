import tls from 'node:tls';

/** Bun release with unconditional `tls.getCACertificates('system')` (no --use-system-ca). */
export const MIN_BUN_SYSTEM_CA_FIX = '1.3.14';

/**
 * On managed macOS hosts (NetworkExtension content filters), older Bun builds
 * stalled ~10s loading system CAs because keychain enumeration triggered
 * OCSP/CRL/AIA fetches per certificate. Bun >= 1.3.14 matches Node/Chromium:
 * no kSecMatchTrustedOnly, trust-settings parser via local XPC, and
 * SecTrustEvaluateWithError only as a last resort with network fetch disabled.
 */
export const MACOS_SYSTEM_CA_ENUMERATION_NOTE =
	'Bun >= 1.3.14 loads macOS keychain CAs without network I/O during tls.getCACertificates("system"), avoiding multi-second stalls on managed Macs with content filters. Handshake-time EKU and basic-constraint checks are unchanged.';

const CACHE_TTL_MS = 5 * 60 * 1000;
/** Warn when fresh enumeration exceeds this on macOS (legacy trustd/network behavior). */
const MACOS_SLOW_ENUMERATION_MS = 2_000;

let cachedSystemCAs: string[] | null = null;
let cachedAt = 0;

export interface SystemCARuntimeInfo {
	/** `tls.getCACertificates` is available on this runtime. */
	apiAvailable: boolean;
	/** PEM strings from `tls.getCACertificates('system')` (lazy-loaded on first call). */
	systemCount: number;
	bunVersion: string;
	platform: NodeJS.Platform;
	/**
	 * True on macOS when Bun includes non-blocking keychain enumeration
	 * (trust-settings parser, no revocation fetch during listing).
	 */
	macosEnumerationSafe: boolean;
	/** Explains managed-Mac stall fix; set on darwin. */
	macosNote?: string;
	/** Wall-clock ms for a fresh `getCACertificates('system')` load when measured. */
	enumerationMs?: number;
}

export interface SystemCARuntimeInfoOptions {
	/** Time a forced refresh (doctor diagnostics). */
	measureEnumeration?: boolean;
}

function bunSupportsMacosSystemCAFix(): boolean {
	return Bun.semver.satisfies(Bun.version, `>=${MIN_BUN_SYSTEM_CA_FIX}`);
}

/**
 * Load OS trust-store CA certificates (PEM). Cached for five minutes.
 *
 * On Bun >= 1.3.14, `tls.getCACertificates('system')` returns the OS trust store
 * without `--use-system-ca` or `NODE_USE_SYSTEM_CA` (those flags only affect
 * `getCACertificates('default')`). Enumeration is lazy — no startup cost until
 * first use. Windows includes ROOT, CA, and TrustedPeople stores.
 *
 * On macOS, Bun >= 1.3.14 enumerates the keychain without network I/O, so
 * auto-validation is safe on managed Macs that previously stalled on trustd fetches.
 */
export function getSystemCACertificates(forceRefresh = false): string[] {
	if (!forceRefresh && cachedSystemCAs !== null && Date.now() - cachedAt < CACHE_TTL_MS) {
		return cachedSystemCAs;
	}

	if (typeof tls.getCACertificates !== 'function') {
		cachedSystemCAs = [];
		cachedAt = Date.now();
		return cachedSystemCAs;
	}

	cachedSystemCAs = tls.getCACertificates('system');
	cachedAt = Date.now();
	return cachedSystemCAs;
}

/** True when the runtime exposes a non-empty system CA store. */
export function isSystemCAAvailable(): boolean {
	return getSystemCACertificates().length > 0;
}

/** True when macOS enumeration likely triggered per-cert network revocation fetches. */
export function isMacosSystemCAEnumerationSlow(enumerationMs: number): boolean {
	return process.platform === 'darwin' && enumerationMs > MACOS_SLOW_ENUMERATION_MS;
}

/** Snapshot for doctor / diagnostics. */
export function getSystemCARuntimeInfo(
	options: SystemCARuntimeInfoOptions = {},
): SystemCARuntimeInfo {
	const platform = process.platform;
	const macosEnumerationSafe = platform !== 'darwin' || bunSupportsMacosSystemCAFix();

	let enumerationMs: number | undefined;
	if (options.measureEnumeration) {
		const started = performance.now();
		getSystemCACertificates(true);
		enumerationMs = performance.now() - started;
	}

	const info: SystemCARuntimeInfo = {
		apiAvailable: typeof tls.getCACertificates === 'function',
		systemCount: getSystemCACertificates().length,
		bunVersion: Bun.version,
		platform,
		macosEnumerationSafe,
	};

	if (platform === 'darwin') {
		info.macosNote = MACOS_SYSTEM_CA_ENUMERATION_NOTE;
	}
	if (enumerationMs !== undefined) {
		info.enumerationMs = Math.round(enumerationMs * 100) / 100;
	}

	return info;
}

/**
 * Resolve whether TLS scans should validate against the OS trust store.
 * CLI flag wins, then domain config, then auto-detect when system CAs exist.
 */
export function resolveUseSystemCA(
	cliFlag: boolean | undefined,
	domainConfig: boolean | undefined,
): boolean {
	if (cliFlag !== undefined) {
		return cliFlag;
	}
	if (domainConfig !== undefined) {
		return domainConfig;
	}
	return isSystemCAAvailable();
}

/** Clear the in-memory system CA cache (tests). */
export function clearSystemCACache(): void {
	cachedSystemCAs = null;
	cachedAt = 0;
}

/** Seed the cache without calling `tls.getCACertificates` (tests). */
export function seedSystemCACacheForTests(certs: string[]): void {
	cachedSystemCAs = certs;
	cachedAt = Date.now();
}
