/**
 * Bun install / lockfile / platform-target diagnostics.
 * @see https://bun.sh/docs/cli/install
 */

import {existsSync} from 'fs';
import {formatTable} from './inspect.ts';
import {formatInspectCustom, withInspectCustom} from './inspect-custom.ts';
import {spawnCaptured, shouldColorize} from './process.ts';

export const BUN_INSTALL_DOCS_URL = 'https://bun.com/docs/pm/cli/install';
export {BUN_PM_FILTER_DOCS_URL, BUN_RUNTIME_FILTER_DOCS_URL} from './bun-run-filter.ts';

export const INSTALL_ISSUE_CODES = {
	LEGACY_LOCKFILE: 'INSTALL_LEGACY_LOCKFILE',
	DUAL_LOCKFILE: 'INSTALL_DUAL_LOCKFILE',
	NO_LOCKFILE: 'INSTALL_NO_LOCKFILE',
	PNPM_MIGRATION: 'INSTALL_PNPM_MIGRATION',
	INVALID_TARGET: 'INSTALL_INVALID_TARGET',
} as const;

/** Accepted `bun install --cpu` values. */
export const BUN_INSTALL_CPU_VALUES = ['arm64', 'x64', 'ia32', 'ppc64', 's390x'] as const;

/** Accepted `bun install --os` values. */
export const BUN_INSTALL_OS_VALUES = [
	'linux',
	'darwin',
	'win32',
	'freebsd',
	'openbsd',
	'sunos',
	'aix',
] as const;

export type BunInstallCpu = (typeof BUN_INSTALL_CPU_VALUES)[number];
export type BunInstallOs = (typeof BUN_INSTALL_OS_VALUES)[number];

export const INSTALL_BACKENDS = [
	'hardlink',
	'clonefile',
	'clonefile_each_dir',
	'copyfile',
	'symlink',
] as const;

export type InstallBackend = (typeof INSTALL_BACKENDS)[number];

/** Operator notes from Bun install docs. */
export const INSTALL_BEHAVIOR = {
	platformTargets:
		'Lockfile stores normalized cpu/os; optional platform packages skipped at runtime on other targets',
	cpuOsFlags: 'bun install --cpu=x64 --os=linux for cross-platform installs',
	peerDependencies:
		'Bun auto-installs peers (yarn-like); optional peers from peerDependenciesMeta resolve when possible',
	lockfileText: 'bun.lock text format (Bun >= 1.2); upgrade bun.lockb via --save-text-lockfile',
	lockfileStable: 'Lockfile unchanged across platforms even when installed packages differ',
	cache: 'bun pm cache rm or rm -rf ~/.bun/install/cache',
	backendLinux: 'hardlink default on Linux',
	backendDarwin: 'clonefile default on macOS',
	backendFallback: 'copyfile fallback; symlink for file: deps',
	pnpmMigration: 'pnpm-lock.yaml migrates to bun.lock when bun.lock absent (no opt-out)',
	registryCache: 'NPM metadata cached as ~/.bun/install/cache/*.npm (binary, ~5m staleness)',
} as const;

export interface LockfilePlatformStats {
	/** Entries in bun.lock referencing `"os":`. */
	osMarkers: number;
	/** Entries in bun.lock referencing `"cpu":`. */
	cpuMarkers: number;
}

export interface LockfileState {
	textLock: boolean;
	binaryLock: boolean;
	pnpmLock: boolean;
	pnpmWorkspaceYaml: boolean;
	lockfileVersion?: number;
	configVersion?: number;
	primaryPath?: string;
	/** Both bun.lock and bun.lockb present. */
	dualLock: boolean;
	platformStats: LockfilePlatformStats;
}

export interface InstallPackageConfig {
	overrides: number;
	patchedDependencies: number;
	trustedDependencies: number;
	hasWorkspaces: boolean;
	hasCatalog: boolean;
}

export interface InstallAuditFinding {
	field: string;
	message: string;
	severity: 'error' | 'warning';
	code?: string;
}

export interface InstallRuntimeInfo {
	platform: NodeJS.Platform;
	arch: string;
	targetCpu: string;
	targetOs: string;
	targetValid: boolean;
	targetErrors: string[];
	defaultBackend: InstallBackend;
	lockfile: LockfileState;
	packageConfig: InstallPackageConfig;
	cacheDir: string;
	docsUrl: string;
	/** Cross-platform install command for the active target override. */
	installCommand: string;
}

export interface InstallTargetOverride {
	cpu?: string;
	os?: string;
}

export interface InstallTargetValidation {
	cpu: BunInstallCpu | string;
	os: BunInstallOs | string;
	valid: boolean;
	errors: string[];
}

function normalizeArch(arch: string): BunInstallCpu | string {
	const map: Record<string, BunInstallCpu> = {
		arm64: 'arm64',
		x64: 'x64',
		ia32: 'ia32',
		ppc64: 'ppc64',
		s390x: 's390x',
	};
	return map[arch] ?? arch;
}

function normalizeOs(platform: NodeJS.Platform): BunInstallOs | string {
	if ((BUN_INSTALL_OS_VALUES as readonly string[]).includes(platform)) {
		return platform as BunInstallOs;
	}
	return platform;
}

function dependencyCount(value: unknown): number {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? Object.keys(value).length
		: 0;
}

/** Parse lockfileVersion from JSONC bun.lock text. */
export function parseLockfileVersion(text: string): number | undefined {
	const jsonMatch = text.match(/"lockfileVersion"\s*:\s*(\d+)/);
	if (jsonMatch) {
		return Number(jsonMatch[1]);
	}
	try {
		const parsed = JSON.parse(text) as {lockfileVersion?: number};
		if (typeof parsed.lockfileVersion === 'number') {
			return parsed.lockfileVersion;
		}
	} catch {
		/* JSONC */
	}
	return undefined;
}

/** Parse configVersion from bun.lock when present. */
export function parseLockfileConfigVersion(text: string): number | undefined {
	const match = text.match(/"configVersion"\s*:\s*(\d+)/);
	return match ? Number(match[1]) : undefined;
}

/** Count platform-specific markers in a bun.lock file. */
export function analyzeLockfilePlatformStats(text: string): LockfilePlatformStats {
	return {
		osMarkers: (text.match(/"os"\s*:/g) ?? []).length,
		cpuMarkers: (text.match(/"cpu"\s*:/g) ?? []).length,
	};
}

/** Default install backend for the current platform per Bun docs. */
export function defaultInstallBackend(
	platform: NodeJS.Platform = process.platform,
): InstallBackend {
	if (platform === 'darwin') {
		return 'clonefile';
	}
	if (platform === 'linux') {
		return 'hardlink';
	}
	return 'copyfile';
}

export function isValidInstallCpu(cpu: string): cpu is BunInstallCpu {
	return (BUN_INSTALL_CPU_VALUES as readonly string[]).includes(cpu);
}

export function isValidInstallOs(os: string): os is BunInstallOs {
	return (BUN_INSTALL_OS_VALUES as readonly string[]).includes(os);
}

/** Validate `bun install --cpu` / `--os` override flags. */
export function validateInstallTarget(
	override: InstallTargetOverride = {},
): InstallTargetValidation {
	const cpu = override.cpu ?? normalizeArch(process.arch);
	const os = override.os ?? normalizeOs(process.platform);
	const errors: string[] = [];

	if (override.cpu && !isValidInstallCpu(override.cpu)) {
		errors.push(`invalid --cpu "${override.cpu}" (expected: ${BUN_INSTALL_CPU_VALUES.join(', ')})`);
	}
	if (override.os && !isValidInstallOs(override.os)) {
		errors.push(`invalid --os "${override.os}" (expected: ${BUN_INSTALL_OS_VALUES.join(', ')})`);
	}

	return {cpu, os, valid: errors.length === 0, errors};
}

/** Build the equivalent `bun install` command for a target override. */
export function formatInstallTargetCommand(override: InstallTargetOverride = {}): string {
	const target = validateInstallTarget(override);
	const flags: string[] = [];
	if (override.cpu) {
		flags.push(`--cpu=${target.cpu}`);
	}
	if (override.os) {
		flags.push(`--os=${target.os}`);
	}
	return flags.length > 0 ? `bun install ${flags.join(' ')}` : 'bun install';
}

/** Read overrides / patchedDependencies / workspaces from package.json. */
export async function extractInstallPackageConfig(
	packageJsonPath: string,
): Promise<InstallPackageConfig> {
	const file = Bun.file(packageJsonPath);
	if (!(await file.exists())) {
		return {
			overrides: 0,
			patchedDependencies: 0,
			trustedDependencies: 0,
			hasWorkspaces: false,
			hasCatalog: false,
		};
	}

	const pkg = (await file.json()) as Record<string, unknown>;
	const workspaces = pkg.workspaces;
	let hasWorkspaces = false;
	let hasCatalog = false;

	if (typeof workspaces === 'object' && workspaces !== null && !Array.isArray(workspaces)) {
		const ws = workspaces as Record<string, unknown>;
		hasWorkspaces = Array.isArray(ws.packages) && ws.packages.length > 0;
		hasCatalog =
			(typeof ws.catalog === 'object' && ws.catalog !== null) ||
			(typeof ws.catalogs === 'object' && ws.catalogs !== null);
	} else if (Array.isArray(workspaces)) {
		hasWorkspaces = workspaces.length > 0;
	}

	const trusted = pkg.trustedDependencies;
	return {
		overrides: dependencyCount(pkg.overrides),
		patchedDependencies: dependencyCount(pkg.patchedDependencies),
		trustedDependencies: Array.isArray(trusted) ? trusted.length : 0,
		hasWorkspaces,
		hasCatalog,
	};
}

/** Detect lockfiles and parse bun.lock metadata. */
export async function detectLockfileState(root: string): Promise<LockfileState> {
	const textPath = `${root}/bun.lock`;
	const binaryPath = `${root}/bun.lockb`;
	const pnpmPath = `${root}/pnpm-lock.yaml`;
	const pnpmWorkspacePath = `${root}/pnpm-workspace.yaml`;

	const [textLock, binaryLock, pnpmLock, pnpmWorkspaceYaml] = await Promise.all([
		Bun.file(textPath).exists(),
		Bun.file(binaryPath).exists(),
		Bun.file(pnpmPath).exists(),
		Bun.file(pnpmWorkspacePath).exists(),
	]);

	const state: LockfileState = {
		textLock,
		binaryLock,
		pnpmLock,
		pnpmWorkspaceYaml,
		dualLock: textLock && binaryLock,
		platformStats: {osMarkers: 0, cpuMarkers: 0},
	};

	if (textLock) {
		state.primaryPath = textPath;
		try {
			const text = await Bun.file(textPath).text();
			state.lockfileVersion = parseLockfileVersion(text);
			state.configVersion = parseLockfileConfigVersion(text);
			state.platformStats = analyzeLockfilePlatformStats(text);
		} catch {
			/* unreadable lockfile */
		}
	} else if (binaryLock) {
		state.primaryPath = binaryPath;
	}

	return state;
}

/** Doctor findings for install / lockfile / target state. */
export function auditInstallState(
	lockfile: LockfileState,
	target: InstallTargetValidation,
	root: string,
): InstallAuditFinding[] {
	const findings: InstallAuditFinding[] = [];

	if (!target.valid) {
		for (const error of target.errors) {
			findings.push({
				field: 'install.target',
				message: error,
				severity: 'error',
				code: INSTALL_ISSUE_CODES.INVALID_TARGET,
			});
		}
	}

	if (!lockfile.textLock && !lockfile.binaryLock && !lockfile.pnpmLock) {
		findings.push({
			field: 'install.lockfile',
			message: 'No bun.lock, bun.lockb, or pnpm-lock.yaml found — run bun install',
			severity: 'warning',
			code: INSTALL_ISSUE_CODES.NO_LOCKFILE,
		});
	}

	if (lockfile.binaryLock && !lockfile.textLock) {
		findings.push({
			field: 'install.lockfile',
			message:
				'Legacy bun.lockb detected — migrate with bun install --save-text-lockfile --frozen-lockfile --lockfile-only',
			severity: 'warning',
			code: INSTALL_ISSUE_CODES.LEGACY_LOCKFILE,
		});
	}

	if (lockfile.dualLock) {
		findings.push({
			field: 'install.lockfile',
			message:
				'Both bun.lock and bun.lockb present — remove bun.lockb after verifying text lockfile',
			severity: 'warning',
			code: INSTALL_ISSUE_CODES.DUAL_LOCKFILE,
		});
	}

	if (lockfile.pnpmLock && !lockfile.textLock) {
		findings.push({
			field: 'install.lockfile',
			message:
				'pnpm-lock.yaml will auto-migrate to bun.lock on next bun install (no opt-out); pnpm-workspace.yaml catalogs move to package.json workspaces',
			severity: 'warning',
			code: INSTALL_ISSUE_CODES.PNPM_MIGRATION,
		});
	}

	if (lockfile.pnpmWorkspaceYaml && lockfile.pnpmLock && !lockfile.textLock) {
		findings.push({
			field: 'install.pnpm-workspace',
			message:
				'pnpm-workspace.yaml detected — workspace packages and catalogs migrate to package.json workspaces on install',
			severity: 'warning',
			code: INSTALL_ISSUE_CODES.PNPM_MIGRATION,
		});
	}

	void root;
	return findings;
}

/** Snapshot Bun install target, lockfile, and backend defaults for doctor. */
export async function getInstallRuntimeInfo(
	root: string = process.cwd(),
	override: InstallTargetOverride = {},
): Promise<InstallRuntimeInfo> {
	const target = validateInstallTarget(override);
	const lockfile = await detectLockfileState(root);
	const packageConfig = await extractInstallPackageConfig(`${root}/package.json`);

	return {
		platform: process.platform,
		arch: process.arch,
		targetCpu: target.cpu,
		targetOs: target.os,
		targetValid: target.valid,
		targetErrors: target.errors,
		defaultBackend: defaultInstallBackend(process.platform),
		lockfile,
		packageConfig,
		cacheDir: '~/.bun/install/cache',
		docsUrl: BUN_INSTALL_DOCS_URL,
		installCommand: formatInstallTargetCommand(override),
	};
}

/** Bun.inspect.table of install runtime for doctor output. */
export function formatInstallRuntimeTable(info: InstallRuntimeInfo): string {
	const lock = info.lockfile;
	const lockLabel = lock.textLock
		? `bun.lock v${lock.lockfileVersion ?? '?'}` +
			(lock.configVersion !== undefined ? ` (config ${lock.configVersion})` : '')
		: lock.binaryLock
			? 'bun.lockb (legacy)'
			: lock.pnpmLock
				? 'pnpm-lock.yaml'
				: '(none)';

	const platformNote =
		lock.platformStats.osMarkers + lock.platformStats.cpuMarkers > 0
			? `${lock.platformStats.osMarkers} os / ${lock.platformStats.cpuMarkers} cpu entries (skipped when not matching target)`
			: 'no platform markers';

	const rows = [
		{area: 'target', key: 'cpu', value: String(info.targetCpu)},
		{area: 'target', key: 'os', value: String(info.targetOs)},
		{area: 'target', key: 'valid', value: info.targetValid ? 'yes' : 'no'},
		{area: 'backend', key: 'default', value: info.defaultBackend},
		{area: 'lockfile', key: 'primary', value: lockLabel},
		{area: 'lockfile', key: 'platform', value: platformNote},
		{area: 'peers', key: 'policy', value: 'auto-install (optional meta-aware)'},
		{area: 'package', key: 'overrides', value: String(info.packageConfig.overrides)},
		{area: 'package', key: 'patched', value: String(info.packageConfig.patchedDependencies)},
		{area: 'package', key: 'trusted', value: String(info.packageConfig.trustedDependencies)},
		{area: 'package', key: 'workspaces', value: info.packageConfig.hasWorkspaces ? 'yes' : 'no'},
		{area: 'cache', key: 'dir', value: info.cacheDir},
		{area: 'cmd', key: 'install', value: info.installCommand},
	];

	if (lock.pnpmWorkspaceYaml) {
		rows.push({area: 'pnpm', key: 'workspace', value: 'pnpm-workspace.yaml present'});
	}

	return formatTable(rows, ['area', 'key', 'value'], {colors: shouldColorize(process.stderr)});
}

/** Operator table of install behavior notes. */
export function formatInstallBehaviorTable(): string {
	return formatTable(
		[
			{topic: 'platform', note: INSTALL_BEHAVIOR.platformTargets},
			{topic: 'cross-build', note: INSTALL_BEHAVIOR.cpuOsFlags},
			{topic: 'peers', note: INSTALL_BEHAVIOR.peerDependencies},
			{topic: 'lockfile', note: INSTALL_BEHAVIOR.lockfileStable},
			{topic: 'pnpm', note: INSTALL_BEHAVIOR.pnpmMigration},
			{topic: 'cache', note: INSTALL_BEHAVIOR.registryCache},
		],
		['topic', 'note'],
		{colors: shouldColorize(process.stderr)},
	);
}

export type InstallRuntimeInspectable = InstallRuntimeInfo & Record<symbol, unknown>;

/** Install runtime with Bun.inspect.custom table rendering. */
export function installRuntimeInspectable(info: InstallRuntimeInfo): InstallRuntimeInspectable {
	return withInspectCustom(info, depth => {
		if (depth < 0) {
			return '[InstallRuntimeInfo]';
		}
		return formatInstallRuntimeTable(info);
	}) as InstallRuntimeInspectable;
}

export function formatInstallRuntimeInspect(info: InstallRuntimeInfo): string {
	return formatInspectCustom(installRuntimeInspectable(info));
}

/** Candidate lockfile paths for watch mode. */
export function installWatchPaths(root: string = process.cwd()): string[] {
	return [`${root}/package.json`, `${root}/bun.lock`, `${root}/bun.lockb`];
}

/** Only paths that exist on disk (avoids fs.watch ENOENT noise). */
export function resolveInstallWatchPaths(root: string = process.cwd()): string[] {
	return installWatchPaths(root).filter(filePath => existsSync(filePath));
}

export interface BunPmResult {
	ok: boolean;
	message: string;
	exitCode: number;
}

/**
 * Run `bun <subcommand> …` in a project root via {@link spawnCaptured}.
 * Used by semver and constraint auto-remediation (`bun add`, `bun remove`).
 */
export async function runBunPm(root: string, pmArgs: string[]): Promise<BunPmResult> {
	const result = await spawnCaptured(['bun', ...pmArgs], {cwd: root});
	if (result.exitCode === 0) {
		return {
			ok: true,
			message: result.stdout.trim() || `bun ${pmArgs.join(' ')} succeeded`,
			exitCode: 0,
		};
	}
	return {
		ok: false,
		message: result.stderr.trim() || `bun ${pmArgs[0]} failed with exit ${result.exitCode}`,
		exitCode: result.exitCode,
	};
}
