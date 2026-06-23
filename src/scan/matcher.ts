import type {AllowlistItem, ThreatFeedItem} from '../provider/validator.ts';

export interface ThreatMatch {
	item: ThreatFeedItem;
	matchingPackages: Bun.Security.Package[];
}

export interface MatcherInput {
	packages: Bun.Security.Package[];
	rules: ThreatFeedItem[];
	allowlist: AllowlistItem[];
}

function isAllowed(pkg: Bun.Security.Package, allowlist: AllowlistItem[]): AllowlistItem | null {
	for (const entry of allowlist) {
		if (entry.package === pkg.name && Bun.semver.satisfies(pkg.version, entry.range)) {
			return entry;
		}
	}
	return null;
}

/**
 * Match packages against threat feed rules and allowlist entries.
 */
export function matchThreats(input: MatcherInput): ThreatMatch[] {
	const result: ThreatMatch[] = [];

	for (const item of input.rules) {
		const matchingPackages = input.packages.filter(
			p =>
				p.name === item.package &&
				Bun.semver.satisfies(p.version, item.range) &&
				!isAllowed(p, input.allowlist),
		);

		if (matchingPackages.length > 0) {
			result.push({item, matchingPackages});
		}
	}

	return result;
}
