import {expect, test} from 'bun:test';
import type {SemverRule} from '../../src/policy/types.ts';
import {SemverMatcher} from '../../src/provider/semver-matcher.ts';

const RULES: SemverRule[] = [
	{
		id: 'lodash-vuln',
		package: 'lodash',
		range: '<4.17.21',
		severity: 'high',
		description: 'lodash CVE range',
	},
	{
		id: 'axios-vuln',
		package: 'axios',
		range: '<1.0.0',
		severity: 'critical',
		description: 'axios legacy',
	},
];

test('SemverMatcher.checkRule returns the first matching policy rule', () => {
	expect(SemverMatcher.checkRule('lodash', '4.17.20', RULES)?.id).toBe('lodash-vuln');
	expect(SemverMatcher.checkRule('lodash', '4.17.21', RULES)).toBeNull();
	expect(SemverMatcher.checkRule('axios', '0.21.4', RULES)?.severity).toBe('critical');
});

test('SemverMatcher.snapshotCompatible validates snapshot schema semver', () => {
	expect(SemverMatcher.snapshotCompatible('2.0.0', '^2.0.0')).toBe(true);
	expect(SemverMatcher.snapshotCompatible('1.9.0', '^2.0.0')).toBe(false);
});

test('SemverMatcher.filterSatisfying and latestSatisfying pick matching versions', () => {
	const versions = ['1.0.0', '1.2.0', '1.5.0', '2.0.0'];
	expect(SemverMatcher.filterSatisfying(versions, '^1.0.0')).toEqual(['1.0.0', '1.2.0', '1.5.0']);
	expect(SemverMatcher.latestSatisfying(versions, '^1.0.0')).toBe('1.5.0');
});
