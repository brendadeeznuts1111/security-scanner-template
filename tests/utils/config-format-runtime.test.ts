import {expect, test} from 'bun:test';
import {mkdirSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';
import {
	CONFIG_FORMAT_BEHAVIOR,
	CONFIG_FORMAT_ISSUE_CODES,
	FORMAT_SEPARATION,
	auditConfigFormats,
	discoverInvalidConfigFiles,
	discoverNetworkBaselineFiles,
	discoverVaultFiles,
	formatConfigFormatBehaviorTable,
	formatConfigFormatRuntimeInspect,
	formatConfigFormatRuntimeTable,
	getConfigFormatRuntimeInfo,
} from '../../src/utils/config-format-runtime.ts';

function makeProject(): string {
	const dir = join(tmpdir(), `config-format-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(join(dir, 'domains'), {recursive: true});
	mkdirSync(join(dir, '.vault'), {recursive: true});
	return dir;
}

test('FORMAT_SEPARATION documents JSON5 vs TOML parsers', () => {
	expect(FORMAT_SEPARATION.some(row => row.parser === 'Bun.JSON5.parse')).toBe(true);
	expect(FORMAT_SEPARATION.some(row => row.parser === 'Bun.TOML.parse')).toBe(true);
	expect(FORMAT_SEPARATION.some(row => row.extension === 'bunfig.toml')).toBe(true);
	expect(FORMAT_SEPARATION.some(row => row.configType === 'Network audit baselines')).toBe(true);
});

test('discoverNetworkBaselineFiles finds network-baseline.json5 under .security', () => {
	const root = makeProject();
	mkdirSync(join(root, '.security', 'com.example.service'), {recursive: true});
	writeFileSync(
		join(root, '.security', 'com.example.service', 'network-baseline.json5'),
		'{ domain: "com.example.service", version: 1 }',
	);

	const baselines = discoverNetworkBaselineFiles(root);
	expect(baselines.some(path => path.endsWith('network-baseline.json5'))).toBe(true);

	rmSync(root, {recursive: true, force: true});
});

test('discoverInvalidConfigFiles flags wrong domain extension', () => {
	const root = makeProject();
	writeFileSync(
		join(root, 'domains', 'com.example.bad.security.json'),
		'{"domain":"com.example.bad"}',
	);

	const invalid = discoverInvalidConfigFiles(root);
	expect(invalid.some(file => file.path.endsWith('.security.json'))).toBe(true);

	rmSync(root, {recursive: true, force: true});
});

test('discoverInvalidConfigFiles flags wrong vault extension', () => {
	const root = makeProject();
	writeFileSync(join(root, '.vault', 'com.example.bad.inventory.json'), '{}');

	const invalid = discoverInvalidConfigFiles(root);
	expect(invalid.some(file => file.kind === 'vault')).toBe(true);

	rmSync(root, {recursive: true, force: true});
});

test('discoverVaultFiles finds inventory json5 files', () => {
	const root = makeProject();
	writeFileSync(
		join(root, '.vault', 'com.example.good.inventory.json5'),
		'{domain: "com.example.good"}',
	);

	const vault = discoverVaultFiles(root);
	expect(vault.some(path => path.endsWith('com.example.good.inventory.json5'))).toBe(true);

	rmSync(root, {recursive: true, force: true});
});

test('auditConfigFormats warns when domains exist without TOML policy', async () => {
	const root = makeProject();
	writeFileSync(
		join(root, 'domains', 'com.example.good.security.json5'),
		'{ domain: "com.example.good" }',
	);

	const info = await getConfigFormatRuntimeInfo(root);
	const findings = auditConfigFormats(info);
	expect(findings.some(f => f.code === CONFIG_FORMAT_ISSUE_CODES.POLICY_MISSING)).toBe(true);

	rmSync(root, {recursive: true, force: true});
});

test('auditConfigFormats errors on invalid extension files', async () => {
	const root = makeProject();
	writeFileSync(
		join(root, 'domains', 'com.example.bad.security.json'),
		'{"domain":"com.example.bad"}',
	);

	const info = await getConfigFormatRuntimeInfo(root);
	const findings = auditConfigFormats(info);
	expect(findings.some(f => f.code === CONFIG_FORMAT_ISSUE_CODES.WRONG_EXTENSION)).toBe(true);
	expect(info.invalidFiles.length).toBeGreaterThan(0);

	rmSync(root, {recursive: true, force: true});
});

test('auditConfigFormats detects policy drift between JSON5 and TOML', async () => {
	const root = makeProject();
	writeFileSync(
		join(root, 'domains', 'com.example.drift.security.json5'),
		`{
			domain: "com.example.drift",
			supplyChain: {
				policy: { fatal: ["malware"], warn: ["protestware"] }
			}
		}`,
	);
	writeFileSync(
		join(root, 'security.policy.toml'),
		`[policy.default]
fatal = ["backdoor", "malware"]
warn = ["protestware", "adware"]
`,
	);

	const info = await getConfigFormatRuntimeInfo(root);
	expect(info.policyDrift.length).toBe(1);
	const findings = auditConfigFormats(info);
	expect(findings.some(f => f.code === CONFIG_FORMAT_ISSUE_CODES.POLICY_DRIFT)).toBe(true);

	rmSync(root, {recursive: true, force: true});
});

test('getConfigFormatRuntimeInfo reports parser API availability', async () => {
	const info = await getConfigFormatRuntimeInfo(process.cwd());
	expect(info.json5Available).toBe(true);
	expect(info.tomlAvailable).toBe(true);
	expect(info.docsUrl.json5).toContain('json5');
	expect(info.docsUrl.toml).toContain('toml');
});

test('formatConfigFormatRuntimeTable and inspect render doctor output', async () => {
	const info = await getConfigFormatRuntimeInfo(process.cwd());
	const table = formatConfigFormatRuntimeTable(info);
	expect(table).toContain('Bun.JSON5.parse');
	expect(table).toContain('Bun.TOML.parse');
	expect(table).toContain('network-baseline.json5');

	const inspect = formatConfigFormatRuntimeInspect(info);
	expect(inspect).toContain('domain');

	const behavior = formatConfigFormatBehaviorTable();
	expect(behavior).toContain(CONFIG_FORMAT_BEHAVIOR.noBunTomlParse);
});
