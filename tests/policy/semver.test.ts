import {expect, test} from 'bun:test';
import {extractSemverConfigFromToml, extractSemverRulesFromToml} from '../../src/policy/semver.ts';
import {loadPolicy} from '../../src/policy/loader.ts';
import {mkdir, rm, writeFile} from 'fs/promises';
import path from 'path';

const TEST_DIR = `/tmp/policy-semver-${Date.now()}`;

test('extract semver rules from toml semver.rule blocks', () => {
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

test('extractSemverConfigFromToml parses packages and blocked tables', () => {
	const config = extractSemverConfigFromToml({
		semver: {
			packages: {lodash: '>=4.17.21'},
			blocked: {'bad-pkg': '<1.0.0'},
		},
	});
	expect(config.packages?.lodash).toBe('>=4.17.21');
	expect(config.blocked?.['bad-pkg']).toBe('<1.0.0');
});

test('loadPolicy loads semver rules from security.policy.toml', async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
	await mkdir(TEST_DIR, {recursive: true});
	await writeFile(
		path.join(TEST_DIR, 'security.policy.toml'),
		`[[semver.rule]]
id = "test-rule"
package = "left-pad"
range = "<1.0.0"
severity = "low"
description = "test"
`,
	);

	const doc = await loadPolicy(path.join(TEST_DIR, 'security.policy.toml'));
	expect(doc.semver?.rules).toHaveLength(1);
	expect(doc.semver?.rules[0]?.package).toBe('left-pad');
	await rm(TEST_DIR, {recursive: true, force: true});
});