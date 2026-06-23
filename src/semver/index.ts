import {semver} from 'bun';

/** Re-export for callers that prefer the documented `import {semver} from 'bun'` style. */
export {semver};

export interface VersionRange {
	min?: string;
	max?: string;
	exclude?: string[];
	include?: string[];
}

/**
 * Check if `version` satisfies `range` (node-semver compatible).
 * @see https://bun.com/docs/runtime/semver#bun-semver-satisfies-version-string-range-string--boolean
 */
export function satisfiesVersion(version: string, range: string): boolean {
	return semver.satisfies(version, range);
}

/**
 * Compare two versions. Returns 1 if a > b, -1 if a < b, 0 if equal.
 * @see https://bun.com/docs/runtime/semver#bun-semver-order-versiona-string-versionb-string--0--1---1
 */
export function orderVersions(a: string, b: string): -1 | 0 | 1 {
	return semver.order(a, b);
}

/**
 * Version matcher backed by Bun's built-in semver API.
 *
 * Bun >=1.3.14 synthesizes implicit optional peers from `peerDependenciesMeta`;
 * `satisfies()` evaluates concrete installed versions after that resolution.
 */
export class VersionMatcher {
	/**
	 * Check if a version satisfies a semver range.
	 * Supports ^, ~, >=, <=, <, >, =, hyphen ranges, and x wildcards.
	 */
	static satisfies(version: string, range: string): boolean {
		return satisfiesVersion(version, range);
	}

	/**
	 * Check if a version is compatible with a set of constraints.
	 *
	 * A version passes when it satisfies all lower/upper bounds and excludes,
	 * and at least one include constraint (if any are provided).
	 */
	static isCompatible(version: string, constraints: VersionRange): boolean {
		if (constraints.exclude?.some(excluded => satisfiesVersion(version, excluded))) {
			return false;
		}

		const ranges: string[] = [];
		if (constraints.min) ranges.push(`>=${constraints.min}`);
		if (constraints.max) ranges.push(`<=${constraints.max}`);

		if (constraints.include && constraints.include.length > 0) {
			const includeCheck = constraints.include.some(r => satisfiesVersion(version, r));
			if (!includeCheck) return false;
		}

		return ranges.every(r => satisfiesVersion(version, r));
	}

	/**
	 * Find the latest version that satisfies a range from a list.
	 */
	static latestSatisfying(versions: string[], range: string): string | null {
		const satisfying = versions.filter(v => satisfiesVersion(v, range));
		if (satisfying.length === 0) return null;
		return satisfying.sort((a, b) => -orderVersions(a, b))[0] ?? null;
	}

	/**
	 * Compare two versions. Returns 1 if a is greater, -1 if b is greater, 0 if equal.
	 */
	static compare(a: string, b: string): -1 | 0 | 1 {
		return orderVersions(a, b);
	}
}
