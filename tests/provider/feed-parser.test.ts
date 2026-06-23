import {expect, test} from 'bun:test';
import {FeedParser, threatFeedRange} from '../../src/provider/feed-parser.ts';

test('threatFeedRange prefers versionRange alias', () => {
	const item = {
		package: 'lodash',
		range: '*',
		versionRange: '<4.17.21',
		url: null,
		description: 'vuln',
		categories: ['malware' as const],
	};
	expect(threatFeedRange(item)).toBe('<4.17.21');
});

test('FeedParser.matchThreats uses Bun.semver via SemverMatcher', () => {
	const parser = new FeedParser();
	parser.setThreats([
		{
			id: 'CVE-2026-1234',
			package: 'lodash',
			versionRange: '<4.17.21',
			severity: 'high',
			description: 'CVE-2026-1234',
			published: '2026-01-01T00:00:00.000Z',
		},
	]);
	const hits = parser.matchThreats('lodash', '4.17.20');
	expect(hits).toHaveLength(1);
	expect(hits[0]?.versionRange).toBe('<4.17.21');
});