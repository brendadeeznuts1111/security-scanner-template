import {expect, test} from 'bun:test';
import {
	checkPolicyConstraintViolations,
	filterViolationsByConstraintAllowlist,
} from '../../src/intel/constraint-checks.ts';
import type {UnifiedSemverViolation} from '../../src/intel/semver-violations.ts';

const policy = {
	constraints: {
		strictAllowlist: false,
		allow: [{package: '@trusted/*', reason: 'Internal'}],
		block: [{package: 'event-stream', reason: 'Malware', severity: 'critical' as const}],
		require: [{package: 'lodash', range: '>=4.17.21', reason: 'Secure baseline'}],
	},
};

test('checkPolicyConstraintViolations flags blocked packages', () => {
	const violations = checkPolicyConstraintViolations(
		{'event-stream': '3.3.6', 'lodash': '4.17.21'},
		policy,
	);
	expect(violations.some(v => v.source === 'policy-constraint-block')).toBe(true);
});

test('checkPolicyConstraintViolations enforces strict allowlist', () => {
	const violations = checkPolicyConstraintViolations(
		{'left-pad': '1.0.0'},
		{
			constraints: {
				strictAllowlist: true,
				allow: [{package: 'lodash', reason: 'ok'}],
			},
		},
	);
	expect(violations.some(v => v.source === 'policy-constraint-allow')).toBe(true);
});

test('checkPolicyConstraintViolations requires packages and ranges', () => {
	const missing = checkPolicyConstraintViolations({axios: '1.0.0'}, policy);
	expect(missing.some(v => v.source === 'policy-constraint-require')).toBe(true);

	const outdated = checkPolicyConstraintViolations({lodash: '4.17.20'}, policy);
	expect(outdated.some(v => v.message.includes('does not satisfy'))).toBe(true);
});

test('filterViolationsByConstraintAllowlist suppresses trusted threat-feed hits', () => {
	const violations: UnifiedSemverViolation[] = [
		{
			package: '@trusted/core',
			version: '1.0.0',
			source: 'threat-feed',
			severity: 'high',
			message: 'CVE',
			ruleId: 'CVE-1',
		},
		{
			package: 'axios',
			version: '0.1.0',
			source: 'threat-feed',
			severity: 'high',
			message: 'CVE',
			ruleId: 'CVE-2',
		},
	];
	const filtered = filterViolationsByConstraintAllowlist(violations, policy);
	expect(filtered).toHaveLength(1);
	expect(filtered[0]?.package).toBe('axios');
});
