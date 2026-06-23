import type {ThreatFeedItem} from './validator.ts';

export type SeverityLevel = 'fatal' | 'warn';

export interface SeverityPolicy {
	/** Categories that trigger a fatal block */
	fatal: string[];
	/** Categories that trigger a warning */
	warn: string[];
}

export const DEFAULT_POLICY: SeverityPolicy = {
	fatal: ['backdoor', 'botnet', 'token-stealer', 'malware'],
	warn: ['protestware', 'adware', 'deprecated', 'unmaintained'],
};

/**
 * Categorize a threat feed item using the provided policy. If no policy is
 * supplied, the default policy is used.
 */
export function categorize(
	item: ThreatFeedItem,
	policy: SeverityPolicy = DEFAULT_POLICY,
): SeverityLevel | null {
	for (const category of item.categories) {
		if (policy.fatal.includes(category)) return 'fatal';
	}

	for (const category of item.categories) {
		if (policy.warn.includes(category)) return 'warn';
	}

	return null;
}

// --- Global policy override for the supply-chain domain API ---
//
// The provider itself keeps its own policy in the provider instance. The domain
// module uses this global as a default when no per-provider policy is given.

let globalPolicy: SeverityPolicy | null = null;

export function setPolicy(policy: SeverityPolicy): void {
	globalPolicy = policy;
}

export function getPolicy(): SeverityPolicy {
	return globalPolicy ?? DEFAULT_POLICY;
}

export function resetPolicy(): void {
	globalPolicy = null;
}
