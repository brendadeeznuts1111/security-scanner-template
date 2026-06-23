import {describe, expect, test} from 'bun:test';
import {extractSemverConfigFromToml, extractSemverRulesFromToml} from '../../src/policy/semver.ts';
import {loadPolicy} from '../../src/policy/loader.ts';
import {withTestDir, writeFileInDir} from '../helpers.ts';

describe('extractSemverRulesFromToml', () => {
	test('extracts semver.rule blocks', () => {
		const rules = extractSemverRulesFromToml({
			semver: {
				rule: [
					{
						id: 'axios-vuln',
						package: 'axios',
						range: '<1.0.0',
						severity: 'critical',
						description: 'axios vuln',
					},
				],
			},
		});
		expect(rules).toHaveLength(1);
		expect(rules[0]?.id).toBe('axios-vuln');
	});
});

describe('extractSemverConfigFromToml', () => {
	test('parses packages and blocked tables', () => {
		const config = extractSemverConfigFromToml({
			semver: {
				packages: {lodash: '>=4.17.21'},
				blocked: {'bad-pkg': '<1.0.0'},
			},
		});
		expect(config.packages?.lodash).toBe('>=4.17.21');
		expect(config.blocked?.['bad-pkg']).toBe('<1.0.0');
	});
});

describe('loadPolicy semver', () => {
	test('loads semver rules from security.policy.toml', async () => {
		await withTestDir('policy-semver', async root => {
			await writeFileInDir(
				root,
				'security.policy.toml',
				`[[semver.rule]]
id = "test-rule"
package = "left-pad"
range = "<1.0.0"
severity = "low"
description = "test"
`,
			);

			const doc = await loadPolicy(`${root}/security.policy.toml`);
			expect(doc.semver?.rules).toHaveLength(1);
			expect(doc.semver?.rules[0]?.package).toBe('left-pad');
		});
	});
});
