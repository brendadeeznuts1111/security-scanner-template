import {expect, test} from 'bun:test';
import {
	deriveSafeRange,
	planPackageUpgrades,
	suggestRemediation,
} from '../../src/intel/semver-remediation.ts';
import {safeRangeFromThreat} from '../../src/intel/semver-ranges.ts';
import {SemverMatcher} from '../../src/provider/semver-matcher.ts';

test('deriveSafeRange inverts less-than vulnerability ranges', () => {
	expect(deriveSafeRange({range: '<4.17.21'})).toBe('>=4.17.21');
	expect(deriveSafeRange({range: '<=1.0.0', safeRange: '>=2.0.0'})).toBe('>=2.0.0');
});

test('safeRangeFromThreat prefers fixedIn over versionRange', () => {
	expect(
		safeRangeFromThreat({
			fixedIn: '4.17.21',
			versionRange: '<4.17.21',
		}),
	).toBe('>=4.17.21');
	expect(safeRangeFromThreat({versionRange: '<4.17.21'})).toBe('>=4.17.21');
});

test('SemverMatcher.latestSatisfying picks highest matching version', () => {
	const latest = SemverMatcher.latestSatisfying(['4.17.19', '4.17.21', '4.17.22'], '>=4.17.21');
	expect(latest).toBe('4.17.22');
});

test('suggestRemediation uses fixedIn minimum when registry lookup is unavailable', async () => {
	const suggestion = await suggestRemediation(
		{
			package: 'lodash',
			version: '4.17.20',
			source: 'threat-feed',
			safeRange: '>=4.17.21',
			ruleId: 'CVE-2026-1',
		},
		[],
	);
	expect(suggestion.suggestedVersion).toBe('4.17.21');
	expect(suggestion.safeRange).toBe('>=4.17.21');
});

test('planPackageUpgrades collapses multiple CVEs to highest target version', () => {
	const plans = planPackageUpgrades([
		{
			package: 'lodash',
			version: '4.17.20',
			source: 'threat-feed',
			remediation: {
				safeRange: '>=4.17.21',
				suggestedVersion: '4.17.21',
				latestInRange: '4.17.21',
			},
			ruleId: 'CVE-1',
		},
		{
			package: 'lodash',
			version: '4.17.20',
			source: 'threat-feed',
			remediation: {
				safeRange: '>=4.17.22',
				suggestedVersion: '4.17.22',
				latestInRange: '4.17.22',
			},
			ruleId: 'CVE-2',
		},
	]);
	expect(plans).toHaveLength(1);
	expect(plans[0]?.toVersion).toBe('4.17.22');
	expect(plans[0]?.ruleIds).toEqual(['CVE-1', 'CVE-2']);
});
