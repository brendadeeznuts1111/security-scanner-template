import {expect, test} from 'bun:test';
import {FeedParser} from '../../src/provider/feed-parser.ts';
import {ThreatFeedMatcher} from '../../src/registry/threat-feed.ts';
import type {ThreatFeedEntry} from '../../src/provider/feed-types.ts';

const lodashThreat: ThreatFeedEntry = {
	id: 'CVE-1',
	package: 'lodash',
	versionRange: '<4.17.21',
	severity: 'high',
	description: 'Prototype pollution',
	published: '2026-01-01T00:00:00.000Z',
};

test('FeedParser.matchThreats correlates package versions', () => {
	const parser = new FeedParser();
	parser.setThreats([lodashThreat]);

	const matches = parser.matchThreats('lodash', '4.17.20');
	expect(matches).toHaveLength(1);
	expect(matches[0]?.id).toBe('CVE-1');
});

test('FeedParser.matchThreats skips non-matching versions', () => {
	const parser = new FeedParser();
	parser.setThreats([lodashThreat]);

	expect(parser.matchThreats('lodash', '4.17.21')).toHaveLength(0);
	expect(parser.matchThreats('express', '4.17.20')).toHaveLength(0);
});

test('FeedParser.getActiveThreats filters by package', () => {
	const parser = new FeedParser();
	parser.setThreats([
		lodashThreat,
		{...lodashThreat, id: 'CVE-2', package: 'express'},
	]);

	expect(parser.getActiveThreats()).toHaveLength(2);
	expect(parser.getActiveThreats('lodash')).toHaveLength(1);
	expect(parser.getActiveThreats('lodash')[0]?.id).toBe('CVE-1');
});

test('ThreatFeedMatcher.checkPackageThreats delegates to loaded feed', () => {
	const matcher = new ThreatFeedMatcher();
	matcher.setLoadedThreats([lodashThreat]);

	const threats = matcher.checkPackageThreats('lodash', '4.17.20');
	expect(threats).toHaveLength(1);
	expect(threats[0]?.id).toBe('CVE-1');
});

test('ThreatFeedMatcher.checkPackagesThreats returns only packages with hits', () => {
	const matcher = new ThreatFeedMatcher();
	matcher.setLoadedThreats([lodashThreat]);

	const results = matcher.checkPackagesThreats({
		lodash: '4.17.20',
		express: '4.18.0',
	});
	expect(results.size).toBe(1);
	expect(results.get('lodash')).toHaveLength(1);
	expect(results.has('express')).toBe(false);
});