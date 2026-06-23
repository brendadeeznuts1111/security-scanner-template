import {expect, test, beforeEach, afterEach} from 'bun:test';
import {
	loadPolicy,
	discoverPolicyFiles,
	loadProjectPolicies,
	DEFAULT_POLICY_FILE,
} from '../../src/policy/loader.ts';

const TEST_DIR = `/tmp/policy-loader-test-${Date.now()}`;

beforeEach(async () => {
	await Bun.write(TEST_DIR, '').catch(() => {});
	const {rm} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
	const {mkdir} = await import('fs/promises');
	await mkdir(TEST_DIR, {recursive: true});
});

afterEach(async () => {
	const {rm} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
});

async function writePolicy(relativePath: string, contents: string): Promise<void> {
	const {mkdir} = await import('fs/promises');
	const fullPath = `${TEST_DIR}/${relativePath}`;
	await mkdir(fullPath.split('/').slice(0, -1).join('/'), {recursive: true});
	await Bun.write(fullPath, contents);
}

test('loadPolicy parses a TOML policy file', async () => {
	await writePolicy(
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

	const doc = await loadPolicy(`${TEST_DIR}/${DEFAULT_POLICY_FILE}`);
	expect(doc.default?.fatal).toEqual(['malware']);
	expect(doc.default?.warn).toEqual(['deprecated']);
	expect(doc.override?.length).toBe(1);
	expect(doc.override?.[0]?.package).toBe('internal-*');
});

test('loadPolicy returns empty document for missing file', async () => {
	const doc = await loadPolicy(`${TEST_DIR}/missing.policy.toml`);
	expect(doc).toEqual({});
});

test('discoverPolicyFiles finds root and workspace policies', async () => {
	await writePolicy(DEFAULT_POLICY_FILE, '[policy.default]\nfatal = ["malware"]\n');
	await writePolicy(
		`workspace-a/${DEFAULT_POLICY_FILE}`,
		'[[policy.override]]\npackage = "a"\naction = "ignore"\nreason = "A"\n',
	);
	await writePolicy(
		`workspace-b/${DEFAULT_POLICY_FILE}`,
		'[[policy.override]]\npackage = "b"\naction = "ignore"\nreason = "B"\n',
	);

	const files = await discoverPolicyFiles(TEST_DIR);
	expect(files.length).toBe(3);
	expect(files[0]).toBe(`${TEST_DIR}/${DEFAULT_POLICY_FILE}`);
});

test('loadPolicy parses snapshot and semver sections', async () => {
	await writePolicy(
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

	const doc = await loadPolicy(`${TEST_DIR}/${DEFAULT_POLICY_FILE}`);
	expect(doc.snapshot?.snapshotVersionRange).toBe('^2.0.0');
	expect(doc.snapshot?.compatibleScannerVersions).toBe('>=1.0.0 <3.0.0');
	expect(doc.semver?.rules).toHaveLength(1);
	expect(doc.semver?.rules[0]?.package).toBe('lodash');
});

test('loadPolicy parses patterns section', async () => {
	await writePolicy(
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

	const doc = await loadPolicy(`${TEST_DIR}/${DEFAULT_POLICY_FILE}`);
	expect(doc.patterns?.regex?.[0]?.id).toBe('unsafe-eval');
	expect(doc.patterns?.ast?.[0]?.id).toBe('obfuscated-code');
});

test('loadProjectPolicies merges discovered policies', async () => {
	await writePolicy(DEFAULT_POLICY_FILE, '[policy.default]\nfatal = ["malware"]\n');
	await writePolicy(
		`workspace-a/${DEFAULT_POLICY_FILE}`,
		'[[policy.override]]\npackage = "a"\naction = "ignore"\nreason = "A"\n',
	);

	const doc = await loadProjectPolicies(TEST_DIR);
	expect(doc.default?.fatal).toEqual(['malware']);
	expect(doc.override?.length).toBe(1);
	expect(doc.override?.[0]?.package).toBe('a');
});
