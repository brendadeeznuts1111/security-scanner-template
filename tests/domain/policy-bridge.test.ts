import {expect, test} from 'bun:test';
import {mkdirSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';
import {applyDefaults} from '../../src/config/defaults.ts';
import {
	loadRootProjectPolicy,
	resolvePolicyWatchPaths,
	resolveSupplyChainConfig,
} from '../../src/domain/policy-bridge.ts';

function makeProject(): string {
	const dir = join(tmpdir(), `policy-bridge-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, {recursive: true});
	return dir;
}

test('loadRootProjectPolicy returns null when root policy is absent', async () => {
	const root = makeProject();
	expect(await loadRootProjectPolicy(root)).toBeNull();
	rmSync(root, {recursive: true, force: true});
});

test('loadRootProjectPolicy parses root security.policy.toml', async () => {
	const root = makeProject();
	writeFileSync(
		join(root, 'security.policy.toml'),
		`[policy.default]
fatal = ["malware"]
warn = ["protestware"]
`,
	);

	const doc = await loadRootProjectPolicy(root);
	expect(doc?.default?.fatal).toEqual(['malware']);

	rmSync(root, {recursive: true, force: true});
});

test('resolveSupplyChainConfig bridges TOML policy into policyDocument', async () => {
	const root = makeProject();
	writeFileSync(
		join(root, 'security.policy.toml'),
		`[policy.default]
fatal = ["backdoor", "malware"]
warn = ["protestware"]
`,
	);

	const config = applyDefaults({
		domain: 'com.example.bridge',
		supplyChain: {
			enabled: true,
			policy: {fatal: ['malware'], warn: ['adware']},
		},
		csrf: {enabled: false, tokenLength: 32},
	});

	const sc = await resolveSupplyChainConfig(config, root);
	expect(sc.policyDocument?.default?.fatal).toEqual(['backdoor', 'malware']);
	expect(sc.policy?.fatal).toEqual(['backdoor', 'malware']);
	expect(sc.policy?.warn).toEqual(['protestware']);

	rmSync(root, {recursive: true, force: true});
});

test('resolveSupplyChainConfig keeps JSON5 policy when no TOML file exists', async () => {
	const root = makeProject();
	const config = applyDefaults({
		domain: 'com.example.json5-only',
		supplyChain: {
			enabled: true,
			policy: {fatal: ['malware'], warn: ['adware']},
		},
		csrf: {enabled: false, tokenLength: 32},
	});

	const sc = await resolveSupplyChainConfig(config, root);
	expect(sc.policyDocument).toBeUndefined();
	expect(sc.policy?.fatal).toEqual(['malware']);

	rmSync(root, {recursive: true, force: true});
});

test('resolvePolicyWatchPaths includes root and workspace policies', () => {
	const root = makeProject();
	mkdirSync(join(root, 'workspace'), {recursive: true});
	writeFileSync(join(root, 'security.policy.toml'), '[policy.default]\nfatal = ["malware"]\n');
	writeFileSync(
		join(root, 'workspace', 'security.policy.toml'),
		'[policy.default]\nfatal = ["malware"]\n',
	);
	mkdirSync(join(root, 'templates'), {recursive: true});
	writeFileSync(
		join(root, 'templates', 'security.policy.toml'),
		'[policy.default]\nfatal = ["malware"]\n',
	);

	const paths = resolvePolicyWatchPaths(root);
	expect(paths.some(p => p.endsWith(`${root}/security.policy.toml`))).toBe(true);
	expect(paths.some(p => p.endsWith('workspace/security.policy.toml'))).toBe(true);
	expect(paths.some(p => p.includes('/templates/'))).toBe(false);

	rmSync(root, {recursive: true, force: true});
});
