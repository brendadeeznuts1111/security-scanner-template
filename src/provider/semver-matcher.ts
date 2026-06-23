export {type VersionRange} from '../semver/index.ts';

import {VersionMatcher} from '../semver/index.ts';
import type {SemverRule} from '../policy/types.ts';

/**
 * Stateless semver matcher for version range checks.
 *
 * Delegates to Bun's built-in `semver` API (`import {semver} from 'bun'`), which
 * (Bun >=1.3.14) resolves dependency trees with implicit optional `"*"` peers
 * synthesized from `peerDependenciesMeta` entries missing from `peerDependencies`
 * (pnpm/yarn parity). CVE range matching here applies to resolved installed
 * versions — use `checkPeerDependenciesMeta()` in doctor when auditing packages
 * that declare meta-only optional peers.
 */
export class SemverMatcher {
	static satisfies(version: string, range: string): boolean {
		return VersionMatcher.satisfies(version, range);
	}

	static order(a: string, b: string): -1 | 0 | 1 {
		return VersionMatcher.compare(a, b);
	}

	/** First policy rule whose package and range match the installed version. */
	static checkRule(
		packageName: string,
		version: string,
		rules: readonly SemverRule[],
	): SemverRule | null {
		for (const rule of rules) {
			if (rule.package === packageName && SemverMatcher.satisfies(version, rule.range)) {
				return rule;
			}
		}
		return null;
	}

	/** Validate a snapshot schema semver against a required range. */
	static snapshotCompatible(snapshotVersion: string, requiredRange: string): boolean {
		return SemverMatcher.satisfies(snapshotVersion, requiredRange);
	}

	/** Filter versions that satisfy a semver range. */
	static filterSatisfying(versions: readonly string[], range: string): string[] {
		return versions.filter(version => SemverMatcher.satisfies(version, range));
	}

	/** Find the latest version that satisfies a range from a list. */
	static latestSatisfying(versions: readonly string[], range: string): string | null {
		const satisfying = SemverMatcher.filterSatisfying(versions, range);
		if (satisfying.length === 0) return null;
		return [...satisfying].sort(SemverMatcher.order).pop() ?? null;
	}

	satisfies(version: string, range: string) {
		return SemverMatcher.satisfies(version, range);
	}

	isCompatible(version: string, constraints: Parameters<typeof VersionMatcher.isCompatible>[1]) {
		return VersionMatcher.isCompatible(version, constraints);
	}

	latestSatisfying(versions: string[], range: string) {
		return SemverMatcher.latestSatisfying(versions, range);
	}

	compare(a: string, b: string) {
		return SemverMatcher.order(a, b);
	}

	checkRule(packageName: string, version: string, rules: readonly SemverRule[]) {
		return SemverMatcher.checkRule(packageName, version, rules);
	}

	snapshotCompatible(snapshotVersion: string, requiredRange: string) {
		return SemverMatcher.snapshotCompatible(snapshotVersion, requiredRange);
	}

	filterSatisfying(versions: readonly string[], range: string) {
		return SemverMatcher.filterSatisfying(versions, range);
	}
}
