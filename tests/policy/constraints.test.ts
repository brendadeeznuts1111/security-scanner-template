import {describe, expect, test} from 'bun:test';
import {
	extractConstraintsConfigFromToml,
	hasPolicyConstraints,
	importConstraintRules,
	isLicenseConstraintAllowed,
	isPackageConstraintAllowed,
	matchesLicenseToken,
	matchesPackageGlob,
	matchesSourcePattern,
	matchingBlockConstraint,
} from '../../src/policy/constraints.ts';
import {loadPolicy, DEFAULT_POLICY_FILE} from '../../src/policy/loader.ts';
import {withTestDir, writeFileInDir} from '../helpers.ts';

describe('matchesPackageGlob', () => {
	test('supports scope wildcards', () => {
		expect(matchesPackageGlob('@acme/utils', '@acme/*')).toBe(true);
		expect(matchesPackageGlob('lodash', '@acme/*')).toBe(false);
		expect(matchesPackageGlob('event-stream', 'event-stream')).toBe(true);
	});
});

describe('extractConstraintsConfigFromToml', () => {
	test('parses allow block and require', () => {
		const config = extractConstraintsConfigFromToml({
			constraints: {
				strictAllowlist: true,
				allow: [{package: '@internal/*', reason: 'trusted'}],
				block: [{package: 'event-stream', reason: 'malware', severity: 'critical'}],
				require: [{package: 'lodash', range: '>=4.17.21', reason: 'secure baseline'}],
			},
		});
		expect(config.strictAllowlist).toBe(true);
		expect(config.allow).toHaveLength(1);
		expect(config.block?.[0]?.package).toBe('event-stream');
		expect(config.require?.[0]?.range).toBe('>=4.17.21');
		expect(hasPolicyConstraints(config)).toBe(true);
	});
});

describe('loadPolicy constraints', () => {
	test('merges constraints section', async () => {
		await withTestDir('policy-constraints', async root => {
			await writeFileInDir(
				root,
				DEFAULT_POLICY_FILE,
				`
[[constraints.block]]
package = "left-pad"
reason = "Deprecated unpinned dependency"
severity = "high"
`,
			);

			const doc = await loadPolicy(`${root}/${DEFAULT_POLICY_FILE}`);
			expect(doc.constraints?.block?.[0]?.package).toBe('left-pad');
		});
	});
});

describe('constraint matching', () => {
	test('isPackageConstraintAllowed and matchingBlockConstraint resolve globs', () => {
		const config = extractConstraintsConfigFromToml({
			constraints: {
				allow: [{package: '@trusted/*', reason: 'ok'}],
				block: [{package: 'bad-pkg', reason: 'no'}],
			},
		});
		expect(isPackageConstraintAllowed('@trusted/core', config)).toBe(true);
		expect(matchingBlockConstraint('bad-pkg', config)?.reason).toBe('no');
	});

	test('extractConstraintsConfigFromToml parses deep constraint sections', () => {
		const config = extractConstraintsConfigFromToml({
			constraints: {
				scanTransitive: true,
				strictLicenseAllowlist: true,
				blockImport: [{pattern: 'child_process', reason: 'no subprocess'}],
				blockLicense: [{license: 'GPL-3.0', reason: 'copyleft'}],
				allowLicense: [{license: 'MIT', reason: 'ok'}],
				blockSource: [{pattern: 'git+', reason: 'no git deps'}],
			},
		});
		expect(config.scanTransitive).toBe(true);
		expect(config.strictLicenseAllowlist).toBe(true);
		expect(config.blockImport?.[0]?.pattern).toBe('child_process');
		expect(config.blockLicense?.[0]?.license).toBe('GPL-3.0');
		expect(config.allowLicense?.[0]?.license).toBe('MIT');
		expect(config.blockSource?.[0]?.pattern).toBe('git+');
		expect(hasPolicyConstraints(config)).toBe(true);
	});

	test('matchesLicenseToken and isLicenseConstraintAllowed', () => {
		expect(matchesLicenseToken('MIT', 'MIT')).toBe(true);
		expect(matchesLicenseToken('GPL-3.0-or-later', 'GPL-3.0')).toBe(true);
		const config = extractConstraintsConfigFromToml({
			constraints: {
				allowLicense: [{license: 'MIT', reason: 'ok'}],
			},
		});
		expect(isLicenseConstraintAllowed('Apache-2.0', config)).toBe(false);
		expect(isLicenseConstraintAllowed('MIT', config)).toBe(true);
	});

	test('matchesSourcePattern supports prefix and regex', () => {
		expect(matchesSourcePattern('git+https://github.com/foo/bar', 'git+')).toBe(true);
		expect(matchesSourcePattern('1.0.0', 'git+')).toBe(false);
		expect(matchesSourcePattern('file:../local-pkg', '/^file:/')).toBe(true);
	});

	test('importConstraintRules maps blockImport to transpiler import rules', () => {
		const rules = importConstraintRules(
			extractConstraintsConfigFromToml({
				constraints: {
					blockImport: [{pattern: 'node:fs', reason: 'blocked', severity: 'high'}],
				},
			}),
		);
		expect(rules).toHaveLength(1);
		expect(rules[0]?.type).toBe('import');
		expect(rules[0]?.importPattern).toBe('node:fs');
		expect(rules[0]?.id).toBe('constraint-import:node:fs');
	});
});
