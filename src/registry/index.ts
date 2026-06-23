import {checkPackageVersionsAgainstPolicy} from '../intel/semver-checks.ts';
import type {PackageSemverViolation} from '../intel/semver-checks.ts';
import {loadProjectPolicies} from '../policy/loader.ts';
import {PatternScanner, type PatternMatch} from '../scan/patterns/index.ts';
import type {FeedConfig} from '../provider/feed.ts';
import type {ThreatFeedEntry} from '../provider/feed-types.ts';
import {ThreatFeedMatcher} from './threat-feed.ts';
import {SemverMatcher} from '../provider/semver-matcher.ts';
import {IntegrityHasher} from '../integrity/hasher.ts';
import {ReportGenerator} from '../report/generator.ts';
import {type FeatureName} from '../features/index.ts';
import {VisualRegistry} from '../visual/index.ts';
import {
	PROFILES,
	profileDescription,
	profileFeatures as resolveProfileFeatures,
	type BuildProfile,
} from '../build/profiles.ts';

export {SemverMatcher, IntegrityHasher, ReportGenerator};
export {
	QRGenerator,
	QRCache,
	MASTER_TOKEN_SECRET,
	type QRGenerateOptions,
	type QrCacheMapping,
} from '../visual/index.ts';
export {runDomainQr, getDomainMasterToken, resolveDomainMasterKeyNames} from '../cli/qr.ts';
export {TLSInspector, isSystemCAAvailable, type TLSProfile} from '../intel/tls/index.ts';
export type {PackageSemverViolation} from '../intel/semver-checks.ts';
export type {PatternMatch, PatternSeverity} from '../scan/patterns/index.ts';

export class Registry {
	readonly semver = new SemverMatcher();
	readonly integrity = new IntegrityHasher();
	readonly report = new ReportGenerator();
	readonly visual = new VisualRegistry();
	private readonly threatFeed = new ThreatFeedMatcher();

	constructor() {}

	featuresForProfile(profile: BuildProfile): FeatureName[] {
		return resolveProfileFeatures(profile);
	}

	profileFeatures(profile: BuildProfile): FeatureName[] {
		return resolveProfileFeatures(profile);
	}

	buildProfiles(): Readonly<Record<BuildProfile, readonly FeatureName[]>> {
		return PROFILES;
	}

	describeProfile(profile: BuildProfile): string {
		return profileDescription(profile);
	}

	/** Check installed package versions against merged `security.policy.toml` semver rules. */
	async checkPackageVersions(
		root: string,
		packages: Record<string, string>,
	): Promise<PackageSemverViolation[]> {
		return checkPackageVersionsAgainstPolicy(root, packages);
	}

	/** Scan source files for regex and AST pattern rules in `security.policy.toml`. */
	async scanPatterns(root: string, dir: string): Promise<PatternMatch[]> {
		const policy = await loadProjectPolicies(root);
		const scanner = new PatternScanner(policy);
		return scanner.scanDirectory(dir);
	}

	/** Load threat intel feed entries for semver CVE matching. */
	loadThreatFeed(feedUrl?: string, config?: FeedConfig): Promise<void> {
		return this.threatFeed.loadThreatFeed(feedUrl, config);
	}

	/** Check a single package version against the loaded threat feed. */
	checkPackageThreats(packageName: string, version: string): ThreatFeedEntry[] {
		return this.threatFeed.checkPackageThreats(packageName, version);
	}

	/** Check multiple packages against the loaded threat feed. */
	checkPackagesThreats(packages: Record<string, string>): Map<string, ThreatFeedEntry[]> {
		return this.threatFeed.checkPackagesThreats(packages);
	}

	/** Active threat entries after `loadThreatFeed`. */
	getLoadedThreats(packageName?: string): ThreatFeedEntry[] {
		return this.threatFeed.getLoadedThreats(packageName);
	}

	/** @internal Populate threat feed without fetching (tests). */
	setLoadedThreats(entries: ThreatFeedEntry[]): void {
		this.threatFeed.setLoadedThreats(entries);
	}
}
