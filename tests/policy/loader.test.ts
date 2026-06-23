import {describe, expect, test} from 'bun:test';
import {
	loadPolicy,
	discoverPolicyFiles,
	loadProjectPolicies,
	DEFAULT_POLICY_FILE,
} from '../../src/policy/loader.ts';
import {withTestDir, writeFileInDir} from '../helpers.ts';

describe('loadPolicy', () => {
	test('parses a TOML policy file', async () => {
		await withTestDir('policy-loader', async root => {
			await writeFileInDir(
				root,
				DEFAULT_POLICY_FILE,
				`
[policy.default]
fatal = ["malware"]
warn = ["deprecated"]

[[policy.override]]
package = "internal-*"
action = "ignore"
reason = "Trusted"
`,
			);

			const doc = await loadPolicy(`${root}/${DEFAULT_POLICY_FILE}`);
			expect(doc.default?.fatal).toEqual(['malware']);
			expect(doc.default?.warn).toEqual(['deprecated']);
			expect(doc.override?.length).toBe(1);
			expect(doc.override?.[0]?.package).toBe('internal-*');
		});
	});

	test('returns empty document for missing file', async () => {
		await withTestDir('policy-loader', async root => {
			const doc = await loadPolicy(`${root}/missing.policy.toml`);
			expect(doc).toEqual({});
		});
	});

	test('parses snapshot and semver sections', async () => {
		await withTestDir('policy-loader', async root => {
			await writeFileInDir(
				root,
				DEFAULT_POLICY_FILE,
				`
[snapshot]
allowedDrift = ["branding"]
requiredSections = ["policy"]
snapshotVersionRange = "^2.0.0"
compatibleScannerVersions = ">=1.0.0 <3.0.0"

[[semver.rule]]
id = "lodash-vuln"
package = "lodash"
range = "<4.17.21"
severity = "high"
description = "Outdated lodash"
`,
			);

			const doc = await loadPolicy(`${root}/${DEFAULT_POLICY_FILE}`);
			expect(doc.snapshot?.snapshotVersionRange).toBe('^2.0.0');
			expect(doc.snapshot?.compatibleScannerVersions).toBe('>=1.0.0 <3.0.0');
			expect(doc.semver?.rules).toHaveLength(1);
			expect(doc.semver?.rules[0]?.package).toBe('lodash');
		});
	});

	test('parses patterns section', async () => {
		await withTestDir('policy-loader', async root => {
			await writeFileInDir(
				root,
				DEFAULT_POLICY_FILE,
				`
[[patterns.regex]]
id = "unsafe-eval"
description = "eval usage"
severity = "critical"
pattern = "eval\\\\s*\\\\("
fileGlob = ["**/*.ts"]

[[patterns.ast]]
id = "obfuscated-code"
description = "obfuscation"
severity = "medium"
astPattern = "CallExpression[callee.name='String.fromCharCode']"
`,
			);

			const doc = await loadPolicy(`${root}/${DEFAULT_POLICY_FILE}`);
			expect(doc.patterns?.regex?.[0]?.id).toBe('unsafe-eval');
			expect(doc.patterns?.ast?.[0]?.id).toBe('obfuscated-code');
		});
	});
});

describe('discoverPolicyFiles', () => {
	test('finds root and workspace policies', async () => {
		await withTestDir('policy-loader', async root => {
			await writeFileInDir(root, DEFAULT_POLICY_FILE, '[policy.default]\nfatal = ["malware"]\n');
			await writeFileInDir(
				root,
				`workspace-a/${DEFAULT_POLICY_FILE}`,
				'[[policy.override]]\npackage = "a"\naction = "ignore"\nreason = "A"\n',
			);
			await writeFileInDir(
				root,
				`workspace-b/${DEFAULT_POLICY_FILE}`,
				'[[policy.override]]\npackage = "b"\naction = "ignore"\nreason = "B"\n',
			);

			const files = await discoverPolicyFiles(root);
			expect(files.length).toBe(3);
			expect(files[0]).toBe(`${root}/${DEFAULT_POLICY_FILE}`);
		});
	});
});

describe('loadProjectPolicies', () => {
	test('merges discovered policies', async () => {
		await withTestDir('policy-loader', async root => {
			await writeFileInDir(root, DEFAULT_POLICY_FILE, '[policy.default]\nfatal = ["malware"]\n');
			await writeFileInDir(
				root,
				`workspace-a/${DEFAULT_POLICY_FILE}`,
				'[[policy.override]]\npackage = "a"\naction = "ignore"\nreason = "A"\n',
			);

			const doc = await loadProjectPolicies(root);
			expect(doc.default?.fatal).toEqual(['malware']);
			expect(doc.override?.length).toBe(1);
			expect(doc.override?.[0]?.package).toBe('a');
		});
	});
});
