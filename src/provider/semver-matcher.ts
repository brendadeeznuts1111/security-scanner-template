export {type VersionRange} from '../semver/index.ts';

import {VersionMatcher} from '../semver/index.ts';

/**
 * Stateless semver matcher for version range checks.
 *
 * Delegates to `Bun.semver`, which (Bun >=1.3.14) resolves dependency trees with
 * implicit optional `"*"` peers synthesized from `peerDependenciesMeta` entries
 * missing from `peerDependencies` (pnpm/yarn parity). CVE range matching here
 * applies to resolved installed versions — use `checkPeerDependenciesMeta()` in
 * doctor when auditing packages that declare meta-only optional peers.
 */
export class SemverMatcher {
	satisfies(version: string, range: string) {
		return VersionMatcher.satisfies(version, range);
	}

	isCompatible(version: string, constraints: Parameters<typeof VersionMatcher.isCompatible>[1]) {
		return VersionMatcher.isCompatible(version, constraints);
	}

	latestSatisfying(versions: string[], range: string) {
		return VersionMatcher.latestSatisfying(versions, range);
	}

	compare(a: string, b: string) {
		return VersionMatcher.compare(a, b);
	}
}
