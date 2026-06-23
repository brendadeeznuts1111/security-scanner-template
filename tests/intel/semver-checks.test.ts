import {expect, test, beforeEach, afterEach} from 'bun:test';
import {mkdirSync, rmSync, writeFileSync} from 'fs';
import {join} from 'path';
import {tmpdir} from 'os';
import {createDomainRegistry} from '../../src/config/registry.ts';
import {Registry} from '../../src/registry/index.ts';
import {
	checkPackageVersionsAgainstPolicy,
	findSemverPolicyViolations,
} from '../../src/intel/semver-checks.ts';
import type {SemverRule} from '../../src/policy/types.ts';

function makeProject(): string {
	const dir = join(tmpdir(), `semver-checks-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, {recursive: true});
	return dir;
}

let root = '';

beforeEach(() => {
	root = makeProject();
	writeFileSync(
		join(root, 'security.policy.toml'),
		`[[semver.rule]]
id = "lodash-vuln"
package = "lodash"
range = "<4.17.21"
severity = "high"
description = "Outdated lodash"
`,
	);
});

afterEach(() => {
	rmSync(root, {recursive: true, force: true});
});

test('checkPackageVersionsAgainstPolicy flags versions inside policy ranges', async () => {
	const violations = await checkPackageVersionsAgainstPolicy(root, {
		lodash: '4.17.20',
		axios: '1.6.0',
	});
	expect(violations).toHaveLength(1);
	expect(violations[0]?.rule.id).toBe('lodash-vuln');
});

test('Registry.checkPackageVersions delegates to project policy', async () => {
	const registry = new Registry();
	const violations = await registry.checkPackageVersions(root, {lodash: '4.17.20'});
	expect(violations[0]?.package).toBe('lodash');
});

test('DomainRegistry.checkPackageVersions uses registry root', async () => {
	const registry = createDomainRegistry(root);
	const violations = await registry.checkPackageVersions({lodash: '4.17.20'});
	expect(violations).toHaveLength(1);
});

test('findSemverPolicyViolations maps installed packages to rules', () => {
	const rules: SemverRule[] = [
		{
			id: 'pkg-a',
			package: 'pkg-a',
			range: '<2.0.0',
			severity: 'medium',
			description: 'upgrade pkg-a',
		},
	];
	const hits = findSemverPolicyViolations(
		[
			{name: 'pkg-a', version: '1.0.0'},
			{name: 'pkg-b', version: '9.9.9'},
		],
		rules,
	);
	expect(hits).toHaveLength(1);
	expect(hits[0]?.version).toBe('1.0.0');
});
