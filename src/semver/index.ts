export interface VersionRange {
	min?: string;
	max?: string;
	exclude?: string[];
	include?: string[];
}

/**
 * Version matcher backed by Bun.semver.
 *
 * Bun >=1.3.14 synthesizes implicit optional peers from `peerDependenciesMeta`;
 * `satisfies()` evaluates concrete installed versions after that resolution.
 */
export class VersionMatcher {
	/**
	 * Check if a version satisfies a semver range.
	 * Supports ^, ~, >=, <=, <, >, =, and numeric ranges.
	 */
	static satisfies(version: string, range: string): boolean {
		return Bun.semver.satisfies(version, range);
	}

	/**
	 * Check if a version is compatible with a set of constraints.
	 *
	 * A version passes when it satisfies all lower/upper bounds and excludes,
	 * and at least one include constraint (if any are provided).
	 */
	static isCompatible(version: string, constraints: VersionRange): boolean {
		if (constraints.exclude?.some(excluded => Bun.semver.satisfies(version, excluded))) {
			return false;
		}

		const ranges: string[] = [];
		if (constraints.min) ranges.push(`>=${constraints.min}`);
		if (constraints.max) ranges.push(`<=${constraints.max}`);

		if (constraints.include && constraints.include.length > 0) {
			const includeCheck = constraints.include.some(r => Bun.semver.satisfies(version, r));
			if (!includeCheck) return false;
		}

		return ranges.every(r => Bun.semver.satisfies(version, r));
	}

	/**
	 * Find the latest version that satisfies a range from a list.
	 */
	static latestSatisfying(versions: string[], range: string): string | null {
		const satisfying = versions.filter(v => Bun.semver.satisfies(v, range));
		if (satisfying.length === 0) return null;
		return satisfying.sort((a, b) => -Bun.semver.order(a, b))[0] ?? null;
	}

	/**
	 * Compare two versions. Returns 1 if a is greater, -1 if b is greater, 0 if equal.
	 */
	static compare(a: string, b: string): -1 | 0 | 1 {
		return Bun.semver.order(a, b);
	}
}
