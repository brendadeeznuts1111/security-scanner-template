import {expect, test} from 'bun:test';
import {
	checkPolicySemverViolations,
	checkThreatFeedViolations,
} from '../../src/intel/semver-violations.ts';
import type {PolicyDocument} from '../../src/policy/types.ts';

test('checkPolicySemverViolations enforces packages and blocked ranges', () => {
	const policy: PolicyDocument = {
		semver: {
			rules: [],
			packages: {lodash: '>=4.17.21'},
			blocked: {'bad-pkg': '<2.0.0'},
		},
	};
	const violations = checkPolicySemverViolations(
		{lodash: '4.17.20', 'bad-pkg': '1.5.0'},
		policy,
	);
	expect(violations.some(v => v.source === 'policy-allowed' && v.package === 'lodash')).toBe(
		true,
	);
	expect(violations.some(v => v.source === 'policy-blocked' && v.package === 'bad-pkg')).toBe(
		true,
	);
});

test('checkThreatFeedViolations matches feed version ranges', () => {
	const violations = checkThreatFeedViolations(
		{axios: '0.21.1'},
		[
			{
				id: 'CVE-2026-9999',
				package: 'axios',
				versionRange: '<1.0.0',
				severity: 'high',
				description: 'axios CVE',
				published: '2026-01-01T00:00:00.000Z',
			},
		],
	);
	expect(violations).toHaveLength(1);
	expect(violations[0]?.source).toBe('threat-feed');
	expect(violations[0]?.cve).toBe('CVE-2026-9999');
	expect(violations[0]?.safeRange).toBe('>=1.0.0');
});

test('checkThreatFeedViolations uses fixedIn for remediation range', () => {
	const violations = checkThreatFeedViolations(
		{axios: '0.21.1'},
		[
			{
				id: 'CVE-2026-1000',
				package: 'axios',
				versionRange: '<1.0.0',
				severity: 'high',
				description: 'axios CVE',
				published: '2026-01-01T00:00:00.000Z',
				fixedIn: '0.21.2',
			},
		],
	);
	expect(violations[0]?.safeRange).toBe('>=0.21.2');
});