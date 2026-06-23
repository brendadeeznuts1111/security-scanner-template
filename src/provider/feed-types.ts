import type {ThreatFeedItem} from './validator.ts';

export interface ThreatFeedEntry {
	id: string;
	package: string;
	versionRange: string;
	severity: 'low' | 'medium' | 'high' | 'critical';
	description: string;
	published: string;
	fixedIn?: string;
}

type ExtendedFeedItem = ThreatFeedItem & {
	id?: string;
	cve?: string;
	severity?: string;
	published?: string;
	fixedIn?: string;
	versionRange?: string;
};

/** Normalize a validated feed rule into a semver-matchable threat entry. */
export function threatEntryFromFeedItem(item: ThreatFeedItem, index = 0): ThreatFeedEntry {
	const extended = item as ExtendedFeedItem;
	const severity = extended.severity;
	const normalizedSeverity: ThreatFeedEntry['severity'] =
		severity === 'low' || severity === 'medium' || severity === 'high' || severity === 'critical'
			? severity
			: 'high';

	return {
		id: extended.id ?? extended.cve ?? `${item.package}-${index}`,
		package: item.package,
		versionRange: extended.versionRange ?? item.range,
		severity: normalizedSeverity,
		description: item.description ?? '',
		published: extended.published ?? '1970-01-01T00:00:00.000Z',
		fixedIn: extended.fixedIn,
	};
}