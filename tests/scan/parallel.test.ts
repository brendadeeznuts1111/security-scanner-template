import {expect, test} from 'bun:test';
import {matchThreats} from '../../src/scan/matcher.ts';
import {matchThreatsParallel} from '../../src/scan/parallel.ts';
import {packageFixture} from '../helpers.ts';

const rules = [
	{
		package: 'bad-a',
		range: '1.0.0',
		url: null,
		description: 'Bad A',
		categories: ['malware' as const],
	},
	{
		package: 'bad-b',
		range: '1.0.0',
		url: null,
		description: 'Bad B',
		categories: ['malware' as const],
	},
];

test('matchThreats finds feed matches', () => {
	const matches = matchThreats({
		packages: [packageFixture('bad-a', '1.0.0'), packageFixture('safe', '1.0.0')],
		rules,
		allowlist: [],
	});

	expect(matches.length).toBe(1);
	expect(matches[0]?.item.package).toBe('bad-a');
});

test('matchThreatsParallel matches large package sets', async () => {
	const packages = Array.from({length: 12}, (_, index) =>
		packageFixture(index % 2 === 0 ? 'bad-a' : 'safe', '1.0.0', `pkg-${index}`),
	);

	const matches = await matchThreatsParallel(packages, rules, [], {enabled: true, workerCount: 2});
	expect(matches.length).toBe(1);
	expect(matches[0]?.matchingPackages.length).toBe(6);
});
