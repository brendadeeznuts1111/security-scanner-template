import type {FeedConfig} from '../provider/feed.ts';
import {FeedParser} from '../provider/feed-parser.ts';
import type {ThreatFeedEntry} from '../provider/feed-types.ts';

/** Threat intel feed matching via Bun.semver (isolated from visual/report deps). */
export class ThreatFeedMatcher {
	private feedParser = new FeedParser();

	async loadThreatFeed(feedUrl?: string, config?: FeedConfig): Promise<void> {
		if (config) {
			this.feedParser = new FeedParser(config);
		}
		await this.feedParser.loadThreats(feedUrl);
	}

	checkPackageThreats(packageName: string, version: string): ThreatFeedEntry[] {
		return this.feedParser.matchThreats(packageName, version);
	}

	checkPackagesThreats(packages: Record<string, string>): Map<string, ThreatFeedEntry[]> {
		const results = new Map<string, ThreatFeedEntry[]>();
		for (const [pkg, version] of Object.entries(packages)) {
			const threats = this.checkPackageThreats(pkg, version);
			if (threats.length > 0) {
				results.set(pkg, threats);
			}
		}
		return results;
	}

	getLoadedThreats(packageName?: string): ThreatFeedEntry[] {
		return this.feedParser.getActiveThreats(packageName);
	}

	/** @internal Populate threat feed without fetching (tests). */
	setLoadedThreats(entries: ThreatFeedEntry[]): void {
		this.feedParser.setThreats(entries);
	}
}