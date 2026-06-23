import {expect, test} from 'bun:test';
import {satisfiesVersion} from '../../src/semver/index.ts';
import {
	checkPlatformPathLength,
	estimateWindowsPathUtf16Length,
	getPlatformRuntimeInfo,
	MIN_BUN_TYPES_FFI_TSGo_FIX,
	MIN_BUN_WINDOWS_RUNTIME_FIX,
	readProjectBunTypesVersion,
	WINDOWS_MAX_PATH_UTF16,
} from '../../src/utils/platform-runtime.ts';

test('estimateWindowsPathUtf16Length counts surrogate pairs as two units', () => {
	expect(estimateWindowsPathUtf16Length('a')).toBe(1);
	expect(estimateWindowsPathUtf16Length('😀')).toBe(2);
});

test('checkPlatformPathLength is always safe off Windows', () => {
	if (process.platform === 'win32') {
		return;
	}
	const check = checkPlatformPathLength('x'.repeat(50_000));
	expect(check.safe).toBe(true);
	expect(check.maxUtf16Units).toBeNull();
});

test('checkPlatformPathLength rejects extreme paths on Windows', () => {
	if (process.platform !== 'win32') {
		return;
	}
	const check = checkPlatformPathLength('C:\\' + 'a'.repeat(WINDOWS_MAX_PATH_UTF16));
	expect(check.safe).toBe(false);
	expect(check.maxUtf16Units).toBe(WINDOWS_MAX_PATH_UTF16);
});

test('readProjectBunTypesVersion reads devDependency from package.json', async () => {
	const version = await readProjectBunTypesVersion(`${import.meta.dir}/../../package.json`);
	expect(version).toBeTruthy();
});

test('bunTypesSupportsTsgo reflects installed bun-types version', async () => {
	const info = await getPlatformRuntimeInfo(`${import.meta.dir}/../../package.json`);
	const version = info.bunTypesVersion?.replace(/^[\^~]/, '') ?? '0.0.0';
	const expected = satisfiesVersion(version, `>=${MIN_BUN_TYPES_FFI_TSGo_FIX}`);
	expect(info.bunTypesTsgoCompatible).toBe(expected);
});

test('getPlatformRuntimeInfo reports Windows and tsgo compatibility flags', async () => {
	const info = await getPlatformRuntimeInfo(`${import.meta.dir}/../../package.json`);
	expect(info.platform).toBe(process.platform);
	expect(info.bunVersion).toBe(Bun.version);
	if (process.platform === 'win32') {
		expect(info.maxPathUtf16).toBe(WINDOWS_MAX_PATH_UTF16);
		expect(info.windowsRuntimeSafe).toBe(
			satisfiesVersion(Bun.version, `>=${MIN_BUN_WINDOWS_RUNTIME_FIX}`),
		);
	} else {
		expect(info.windowsRuntimeSafe).toBe(true);
	}
});
