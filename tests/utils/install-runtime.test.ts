import {expect, test} from 'bun:test';
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';
import {
	INSTALL_ISSUE_CODES,
	analyzeLockfilePlatformStats,
	auditInstallState,
	BUN_INSTALL_CPU_VALUES,
	BUN_INSTALL_DOCS_URL,
	INSTALL_BEHAVIOR,
	defaultInstallBackend,
	detectLockfileState,
	extractInstallPackageConfig,
	formatInstallBehaviorTable,
	formatInstallRuntimeInspect,
	formatInstallRuntimeTable,
	formatInstallTargetCommand,
	getInstallRuntimeInfo,
	installWatchPaths,
	parseLockfileConfigVersion,
	parseLockfileVersion,
	resolveInstallWatchPaths,
	validateInstallTarget,
} from '../../src/utils/install-runtime.ts';

test('validateInstallTarget accepts known cpu/os values', () => {
	const valid = validateInstallTarget({cpu: 'arm64', os: 'linux'});
	expect(valid.valid).toBe(true);
	expect(valid.cpu).toBe('arm64');
	expect(valid.os).toBe('linux');
});

test('validateInstallTarget rejects unknown overrides', () => {
	const invalid = validateInstallTarget({cpu: 'mips', os: 'haiku'});
	expect(invalid.valid).toBe(false);
	expect(invalid.errors.length).toBe(2);
});

test('formatInstallTargetCommand builds cross-platform flags', () => {
	expect(formatInstallTargetCommand()).toBe('bun install');
	expect(formatInstallTargetCommand({cpu: 'x64', os: 'linux'})).toBe(
		'bun install --cpu=x64 --os=linux',
	);
});

test('defaultInstallBackend matches platform docs', () => {
	expect(defaultInstallBackend('linux')).toBe('hardlink');
	expect(defaultInstallBackend('darwin')).toBe('clonefile');
	expect(defaultInstallBackend('win32')).toBe('copyfile');
});

test('parseLockfileVersion reads JSONC lockfileVersion', () => {
	const text = `{
		"lockfileVersion": 1,
		"configVersion": 2,
	}`;
	expect(parseLockfileVersion(text)).toBe(1);
	expect(parseLockfileConfigVersion(text)).toBe(2);
});

test('analyzeLockfilePlatformStats counts os/cpu markers', () => {
	const text = `{"os": "linux", "cpu": "arm64", "os": "darwin"}`;
	const stats = analyzeLockfilePlatformStats(text);
	expect(stats.osMarkers).toBe(2);
	expect(stats.cpuMarkers).toBe(1);
});

test('detectLockfileState reads bun.lock version in repo root', async () => {
	const root = process.cwd();
	const state = await detectLockfileState(root);
	if (state.textLock) {
		expect(state.primaryPath).toContain('bun.lock');
		expect(typeof state.lockfileVersion === 'number' || state.lockfileVersion === undefined).toBe(
			true,
		);
	}
});

test('extractInstallPackageConfig reads overrides and workspaces', async () => {
	const dir = join(tmpdir(), `install-runtime-${Date.now()}`);
	mkdirSync(dir, {recursive: true});
	const pkgPath = join(dir, 'package.json');
	writeFileSync(
		pkgPath,
		JSON.stringify({
			overrides: {lodash: '4.17.21'},
			patchedDependencies: {'pkg@1': 'patches/pkg.patch'},
			trustedDependencies: ['esbuild'],
			workspaces: {packages: ['packages/*'], catalog: {react: '^19'}},
		}),
	);

	const config = await extractInstallPackageConfig(pkgPath);
	expect(config.overrides).toBe(1);
	expect(config.patchedDependencies).toBe(1);
	expect(config.trustedDependencies).toBe(1);
	expect(config.hasWorkspaces).toBe(true);
	expect(config.hasCatalog).toBe(true);

	rmSync(dir, {recursive: true, force: true});
});

test('auditInstallState flags legacy lockfile and invalid targets', () => {
	const target = validateInstallTarget({cpu: 'mips'});
	const findings = auditInstallState(
		{
			textLock: false,
			binaryLock: true,
			pnpmLock: false,
			pnpmWorkspaceYaml: false,
			dualLock: false,
			platformStats: {osMarkers: 0, cpuMarkers: 0},
		},
		target,
		'/proj',
	);

	expect(findings.some(f => f.code === INSTALL_ISSUE_CODES.INVALID_TARGET)).toBe(true);
	expect(findings.some(f => f.code === INSTALL_ISSUE_CODES.LEGACY_LOCKFILE)).toBe(true);
});

test('auditInstallState flags dual lockfile', () => {
	const target = validateInstallTarget();
	const findings = auditInstallState(
		{
			textLock: true,
			binaryLock: true,
			pnpmLock: false,
			pnpmWorkspaceYaml: false,
			dualLock: true,
			platformStats: {osMarkers: 0, cpuMarkers: 0},
		},
		target,
		'/proj',
	);

	expect(findings.some(f => f.code === INSTALL_ISSUE_CODES.DUAL_LOCKFILE)).toBe(true);
});

test('auditInstallState flags pnpm migration when bun.lock absent', () => {
	const target = validateInstallTarget();
	const findings = auditInstallState(
		{
			textLock: false,
			binaryLock: false,
			pnpmLock: true,
			pnpmWorkspaceYaml: true,
			dualLock: false,
			platformStats: {osMarkers: 0, cpuMarkers: 0},
		},
		target,
		'/proj',
	);

	expect(findings.some(f => f.code === INSTALL_ISSUE_CODES.PNPM_MIGRATION)).toBe(true);
});

test('getInstallRuntimeInfo snapshots target and lockfile', async () => {
	const info = await getInstallRuntimeInfo(process.cwd());
	expect(info.docsUrl).toBe(BUN_INSTALL_DOCS_URL);
	if ((BUN_INSTALL_CPU_VALUES as readonly string[]).includes(process.arch)) {
		expect(info.targetCpu).toBe(process.arch);
	}
	expect(info.defaultBackend).toBe(defaultInstallBackend(process.platform));
	expect(info.targetValid).toBe(true);
	expect(info.installCommand).toBe('bun install');
});

test('getInstallRuntimeInfo reflects install target override', async () => {
	const info = await getInstallRuntimeInfo(process.cwd(), {cpu: 'x64', os: 'linux'});
	expect(info.targetCpu).toBe('x64');
	expect(info.targetOs).toBe('linux');
	expect(info.installCommand).toBe('bun install --cpu=x64 --os=linux');
});

test('formatInstallRuntimeTable documents peers and cache', async () => {
	const info = await getInstallRuntimeInfo(process.cwd());
	const table = formatInstallRuntimeTable(info);
	expect(table).toContain('auto-install');
	expect(table).toContain('~/.bun/install/cache');
	expect(INSTALL_BEHAVIOR.peerDependencies).toContain('peerDependenciesMeta');
});

test('formatInstallRuntimeInspect renders inspect.custom table', async () => {
	const info = await getInstallRuntimeInfo(process.cwd());
	const inspect = formatInstallRuntimeInspect(info);
	expect(inspect).toContain('target');
	expect(inspect).toContain(String(info.targetCpu));
});

test('formatInstallBehaviorTable lists operator notes', () => {
	const table = formatInstallBehaviorTable();
	expect(table).toContain('cross-build');
	expect(table).toContain(INSTALL_BEHAVIOR.pnpmMigration);
});

test('installWatchPaths includes package.json and lockfiles', () => {
	const paths = installWatchPaths('/proj');
	expect(paths.some(path => path.endsWith('package.json'))).toBe(true);
	expect(paths.some(path => path.endsWith('bun.lock'))).toBe(true);
	expect(paths.some(path => path.endsWith('bun.lockb'))).toBe(true);
});

test('resolveInstallWatchPaths only returns existing paths', () => {
	const dir = join(tmpdir(), `install-watch-${Date.now()}`);
	mkdirSync(dir, {recursive: true});
	writeFileSync(join(dir, 'package.json'), '{}');

	const resolved = resolveInstallWatchPaths(dir);
	expect(resolved.some(path => path.endsWith('package.json'))).toBe(true);
	expect(resolved.some(path => path.endsWith('bun.lock'))).toBe(false);
	expect(resolved.every(path => existsSync(path))).toBe(true);

	rmSync(dir, {recursive: true, force: true});
});
