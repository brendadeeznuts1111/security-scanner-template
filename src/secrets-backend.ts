/**
 * Shared utilities for detecting the OS credential backend behind `Bun.secrets`.
 *
 * These are used by both the scanner runtime and the standalone detection script
 * so the probe logic stays identical between tests and production.
 */

export type SecretsBackendInfo = {
	platform: string;
	backend: string;
	available: boolean;
	error?: string;
};

const PROBE_SERVICE = '__acme_scanner_probe__';
const PROBE_NAME = '__probe__';

let cachedAvailability: boolean | null = null;

function backendNameForPlatform(platform: string): string {
	switch (platform) {
		case 'darwin':
			return 'keychain';
		case 'win32':
			return 'credential-manager';
		case 'linux':
			return 'libsecret';
		default:
			return 'unknown';
	}
}

/**
 * Probes the OS credential store with a non-existent entry. A working store
 * returns null; a missing daemon or permission problem throws.
 *
 * The result is cached for the lifetime of the process because the backend
 * availability does not change during a single run.
 */
export async function isOsCredentialStoreAvailable(): Promise<boolean> {
	if (cachedAvailability !== null) return cachedAvailability;

	if (typeof Bun.secrets === 'undefined') {
		cachedAvailability = false;
		return false;
	}

	try {
		await Bun.secrets.get({service: PROBE_SERVICE, name: PROBE_NAME});
		cachedAvailability = true;
	} catch {
		cachedAvailability = false;
	}

	return cachedAvailability;
}

/**
 * Returns platform and backend information for the active `Bun.secrets` store,
 * plus whether the store is actually responding.
 */
export async function detectSecretsBackend(): Promise<SecretsBackendInfo> {
	const platform = process.platform;
	const backend = backendNameForPlatform(platform);
	const available = await isOsCredentialStoreAvailable();

	const result: SecretsBackendInfo = {
		platform,
		backend,
		available,
	};

	if (!available) {
		result.error =
			typeof Bun.secrets === 'undefined'
				? 'Bun.secrets API is not available'
				: 'OS credential store did not respond to a probe request';
	}

	return result;
}
