import tls from 'node:tls';
import {expect, test, beforeEach, afterEach} from 'bun:test';
import {
	clearSystemCACache,
	getSystemCACertificates,
	getSystemCARuntimeInfo,
	isMacosSystemCAEnumerationSlow,
	isSystemCAAvailable,
	MACOS_SYSTEM_CA_ENUMERATION_NOTE,
	resolveUseSystemCA,
	seedSystemCACacheForTests,
} from '../../../src/intel/tls/system-ca.ts';

const PEM_A = '-----BEGIN CERTIFICATE-----\nMIAA\n-----END CERTIFICATE-----';
const PEM_B = '-----BEGIN CERTIFICATE-----\nMIBB\n-----END CERTIFICATE-----';

beforeEach(() => {
	clearSystemCACache();
	seedSystemCACacheForTests([]);
});

afterEach(() => {
	clearSystemCACache();
});

test('getSystemCACertificates returns cached PEM strings', () => {
	seedSystemCACacheForTests([PEM_A]);
	const first = getSystemCACertificates();
	const second = getSystemCACertificates();

	expect(first).toEqual([PEM_A]);
	expect(second).toBe(first);
});

test('clearSystemCACache allows reloading seeded certificates', () => {
	seedSystemCACacheForTests([PEM_A]);
	expect(getSystemCACertificates()).toEqual([PEM_A]);
	clearSystemCACache();
	seedSystemCACacheForTests([PEM_B]);
	expect(getSystemCACertificates()).toEqual([PEM_B]);
});

test('resolveUseSystemCA prefers CLI flag over domain config', () => {
	seedSystemCACacheForTests([PEM_A]);
	expect(resolveUseSystemCA(false, true)).toBe(false);
	expect(resolveUseSystemCA(true, false)).toBe(true);
});

test('resolveUseSystemCA uses domain config when CLI flag is omitted', () => {
	seedSystemCACacheForTests([PEM_A]);
	expect(resolveUseSystemCA(undefined, true)).toBe(true);
	expect(resolveUseSystemCA(undefined, false)).toBe(false);
});

test('resolveUseSystemCA auto-enables when system CAs are available', () => {
	seedSystemCACacheForTests([PEM_A]);
	expect(resolveUseSystemCA(undefined, undefined)).toBe(true);
});

test('resolveUseSystemCA stays off when system CA store is empty', () => {
	expect(resolveUseSystemCA(undefined, undefined)).toBe(false);
});

test('getSystemCARuntimeInfo reports API availability and count', () => {
	seedSystemCACacheForTests([PEM_A, PEM_B]);
	const info = getSystemCARuntimeInfo();
	expect(info.apiAvailable).toBe(typeof tls.getCACertificates === 'function');
	expect(info.systemCount).toBe(2);
	expect(info.bunVersion).toBe(Bun.version);
	expect(info.platform).toBe(process.platform);
	if (process.platform === 'darwin') {
		expect(info.macosNote).toBe(MACOS_SYSTEM_CA_ENUMERATION_NOTE);
		expect(info.macosEnumerationSafe).toBe(Bun.semver.satisfies(Bun.version, '>=1.3.14'));
	} else {
		expect(info.macosNote).toBeUndefined();
		expect(info.macosEnumerationSafe).toBe(true);
	}
});

test('isMacosSystemCAEnumerationSlow respects platform and threshold', () => {
	if (process.platform === 'darwin') {
		expect(isMacosSystemCAEnumerationSlow(2_001)).toBe(true);
		expect(isMacosSystemCAEnumerationSlow(500)).toBe(false);
	} else {
		expect(isMacosSystemCAEnumerationSlow(5_000)).toBe(false);
	}
});

test('getSystemCARuntimeInfo can measure enumeration timing', () => {
	if (typeof tls.getCACertificates !== 'function') {
		return;
	}

	clearSystemCACache();
	const info = getSystemCARuntimeInfo({measureEnumeration: true});
	expect(info.enumerationMs).toBeGreaterThanOrEqual(0);
	expect(info.systemCount).toBe(getSystemCACertificates().length);
});

test('tls.getCACertificates("system") integration returns PEM strings when populated', () => {
	if (typeof tls.getCACertificates !== 'function') {
		return;
	}

	clearSystemCACache();
	const certs = getSystemCACertificates(true);
	expect(Array.isArray(certs)).toBe(true);
	for (const pem of certs) {
		expect(pem).toMatch(/-----BEGIN CERTIFICATE-----/);
	}
});