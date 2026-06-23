/**
 * Cross-platform Bun runtime notes (Windows path/spawn/connect, bun-types / tsgo).
 */

/** UTF-16 code unit limit for Windows path normalization (returns ENAMETOOLONG beyond this). */
export const WINDOWS_MAX_PATH_UTF16 = 32_767;

/** Bun with Windows path normalization, spawn teardown, connect, and libuv errno fixes. */
export const MIN_BUN_WINDOWS_RUNTIME_FIX = '1.4.0';

/** bun-types release fixing FFI duplicate keys under tsgo (TypeScript native preview). */
export const MIN_BUN_TYPES_FFI_TSGo_FIX = '1.4.0';

export const WINDOWS_RUNTIME_NOTE =
	'Bun >= 1.4.0 on Windows: path normalization returns ENAMETOOLONG instead of heap corruption near 32,767 UTF-16 units; spawn teardown and Bun.connect named-pipe client mode are fixed; libuv errno mapping no longer panics.';

export const BUN_TYPES_TSGo_NOTE =
	'bun-types >= 1.4.0 fixes FFITypeToArgsType / FFITypeToReturnsType duplicate computed keys for tsgo typechecking.';

export interface PlatformRuntimeInfo {
	platform: NodeJS.Platform;
	bunVersion: string;
	/** Installed bun-types version from package.json when readable. */
	bunTypesVersion: string | null;
	windowsRuntimeSafe: boolean;
	bunTypesTsgoCompatible: boolean;
	maxPathUtf16: number | null;
	platformNote?: string;
	typesNote?: string;
}

function bunSupportsWindowsRuntimeFix(): boolean {
	return Bun.semver.satisfies(Bun.version, `>=${MIN_BUN_WINDOWS_RUNTIME_FIX}`);
}

function parseBunTypesVersion(packageJson: string): string | null {
	const match = packageJson.match(/"bun-types"\s*:\s*"([^"]+)"/);
	return match?.[1] ?? null;
}

/** Read bun-types version from the project package.json (doctor diagnostics). */
export async function readProjectBunTypesVersion(
	packageJsonPath = `${process.cwd()}/package.json`,
): Promise<string | null> {
	try {
		const text = await Bun.file(packageJsonPath).text();
		return parseBunTypesVersion(text);
	} catch {
		return null;
	}
}

function bunTypesSupportsTsgo(version: string | null): boolean {
	if (!version) {
		return false;
	}
	const normalized = version.replace(/^[\^~]/, '');
	return Bun.semver.satisfies(normalized, `>=${MIN_BUN_TYPES_FFI_TSGo_FIX}`);
}

/**
 * Rough UTF-16 length estimate for Windows path limit checks.
 * Surrogate pairs count as two units (conservative for astral code points).
 */
export function estimateWindowsPathUtf16Length(filePath: string): number {
	let units = 0;
	for (const char of filePath) {
		const code = char.codePointAt(0) ?? 0;
		units += code > 0xffff ? 2 : 1;
	}
	return units;
}

export interface PathLengthCheck {
	safe: boolean;
	estimatedUtf16Units: number;
	maxUtf16Units: number | null;
	platform: NodeJS.Platform;
}

/** Validate a filesystem path against platform limits before glob/spawn-heavy work. */
export function checkPlatformPathLength(filePath: string): PathLengthCheck {
	const platform = process.platform;
	if (platform !== 'win32') {
		return {
			safe: true,
			estimatedUtf16Units: filePath.length,
			maxUtf16Units: null,
			platform,
		};
	}

	const estimatedUtf16Units = estimateWindowsPathUtf16Length(filePath);
	return {
		safe: estimatedUtf16Units <= WINDOWS_MAX_PATH_UTF16,
		estimatedUtf16Units,
		maxUtf16Units: WINDOWS_MAX_PATH_UTF16,
		platform,
	};
}

/** Snapshot platform-specific Bun compatibility for doctor / diagnostics. */
export async function getPlatformRuntimeInfo(
	packageJsonPath?: string,
): Promise<PlatformRuntimeInfo> {
	const platform = process.platform;
	const bunTypesVersion = await readProjectBunTypesVersion(packageJsonPath);
	const windowsRuntimeSafe = platform !== 'win32' || bunSupportsWindowsRuntimeFix();
	const bunTypesTsgoCompatible = bunTypesSupportsTsgo(bunTypesVersion);

	const info: PlatformRuntimeInfo = {
		platform,
		bunVersion: Bun.version,
		bunTypesVersion,
		windowsRuntimeSafe,
		bunTypesTsgoCompatible,
		maxPathUtf16: platform === 'win32' ? WINDOWS_MAX_PATH_UTF16 : null,
	};

	if (platform === 'win32' && !windowsRuntimeSafe) {
		info.platformNote = WINDOWS_RUNTIME_NOTE;
	}

	if (!bunTypesTsgoCompatible) {
		info.typesNote = BUN_TYPES_TSGo_NOTE;
	}

	return info;
}
