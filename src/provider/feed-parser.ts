import type {FeedConfig} from './feed.ts';
import {loadThreatFeed} from './feed.ts';
import type {ThreatFeedEntry} from './feed-types.ts';
import {threatEntryFromFeedItem} from './feed-types.ts';
import type {ThreatFeedItem} from './validator.ts';
import {SemverMatcher} from './semver-matcher.ts';

/** Resolve the semver range from a feed entry (`range` or `versionRange`). */
export function threatFeedRange(item: ThreatFeedItem): string {
	const extended = item as ThreatFeedItem & {versionRange?: string};
	return extended.versionRange ?? item.range;
}

/**
 * Layer 4 threat-feed parser — correlate installed packages with feed CVE ranges.
 */
export class FeedParser {
	private threats: ThreatFeedEntry[] = [];

	constructor(private readonly config: FeedConfig = {}) {}

	/** Load and cache threat entries from a feed URL or configured source. */
	async loadThreats(feedUrl?: string): Promise<void> {
		const config: FeedConfig = feedUrl ? {...this.config, remote: feedUrl} : this.config;
		const feed = await loadThreatFeed(config);
		this.threats = feed.rules.map((item, index) => threatEntryFromFeedItem(item, index));
	}

	/** Find all threats that match a package and version. */
	matchThreats(packageName: string, version: string): ThreatFeedEntry[] {
		return this.threats.filter(
			threat =>
				threat.package === packageName &&
				SemverMatcher.satisfies(version, threat.versionRange),
		);
	}

	/** Get all active threats (optionally filtered by package). */
	getActiveThreats(packageName?: string): ThreatFeedEntry[] {
		if (packageName) {
			return this.threats.filter(threat => threat.package === packageName);
		}
		return this.threats;
	}

	/** @internal Populate threats without fetching (tests). */
	setThreats(entries: ThreatFeedEntry[]): void {
		this.threats = entries;
	}
}