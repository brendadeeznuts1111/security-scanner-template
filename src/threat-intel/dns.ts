export interface DnsAddress {
	address: string;
	family: 4 | 6;
	ttl?: number;
}

export interface DnsInspectionResult {
	hostname: string;
	resolved: boolean;
	addresses: DnsAddress[];
	suspicious: boolean;
	reason?: string;
}

export interface DnsThreatConfig {
	/** Blocked IP addresses (exact match). */
	blocklist?: string[];
	/** Treat DNS resolution failure as suspicious. */
	requireResolution?: boolean;
	/** Flag addresses with TTL at or below this threshold. */
	suspiciousTtlThreshold?: number;
}

function normalizeLookupResult(
	hostname: string,
	records: Array<{address: string; family: 4 | 6; ttl?: number}>,
): DnsInspectionResult {
	return {
		hostname,
		resolved: records.length > 0,
		addresses: records.map(record => ({
			address: record.address,
			family: record.family,
			ttl: record.ttl,
		})),
		suspicious: false,
	};
}

/**
 * Resolve a hostname with Bun.dns.lookup.
 */
export async function lookupHostname(hostname: string): Promise<DnsAddress[]> {
	const records = await Bun.dns.lookup(hostname);
	return records.map(record => ({
		address: record.address,
		family: record.family,
		ttl: record.ttl,
	}));
}

/**
 * Inspect a hostname for basic DNS-based threat signals.
 */
export async function inspectDomain(
	hostname: string,
	config: DnsThreatConfig = {},
): Promise<DnsInspectionResult> {
	const blocklist = new Set(config.blocklist ?? []);
	const ttlThreshold = config.suspiciousTtlThreshold ?? 60;

	try {
		const addresses = await lookupHostname(hostname);
		const result = normalizeLookupResult(hostname, addresses);

		for (const address of addresses) {
			if (blocklist.has(address.address)) {
				return {
					...result,
					suspicious: true,
					reason: `blocked address ${address.address}`,
				};
			}

			if (address.ttl !== undefined && address.ttl > 0 && address.ttl <= ttlThreshold) {
				return {
					...result,
					suspicious: true,
					reason: `low TTL (${address.ttl}s) for ${address.address}`,
				};
			}
		}

		return result;
	} catch (error) {
		if (config.requireResolution) {
			return {
				hostname,
				resolved: false,
				addresses: [],
				suspicious: true,
				reason: error instanceof Error ? error.message : String(error),
			};
		}

		return {
			hostname,
			resolved: false,
			addresses: [],
			suspicious: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Extract a hostname from a URL for DNS inspection.
 */
export function hostnameFromUrl(url: string): string | null {
	try {
		return new URL(url).hostname;
	} catch {
		return null;
	}
}

/**
 * Inspect the hostname behind a remote feed or registry URL.
 */
export async function inspectFeedUrl(
	url: string,
	config: DnsThreatConfig = {},
): Promise<DnsInspectionResult | null> {
	const hostname = hostnameFromUrl(url);
	if (!hostname) return null;
	return inspectDomain(hostname, config);
}
