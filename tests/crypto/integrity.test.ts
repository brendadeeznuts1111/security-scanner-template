import {expect, test} from 'bun:test';
import {
	digestHex,
	digestHexSync,
	satisfiesVersion,
	verifyDigest,
} from '../../src/crypto/integrity.ts';

test('digestHex computes sha256 hex', async () => {
	const hash = await digestHex('hello');
	expect(hash).toMatch(/^[a-f0-9]{64}$/);
});

test('digestHexSync matches async digest', async () => {
	const input = 'package tarball bytes';
	expect(digestHexSync(input)).toBe(await digestHex(input));
});

test('verifyDigest matches expected hash', async () => {
	const payload = 'mock tarball contents';
	const expected = await digestHex(payload);
	expect(await verifyDigest(payload, expected)).toBe(true);
	expect(await verifyDigest(payload, '0'.repeat(64))).toBe(false);
});

test('satisfiesVersion delegates to Bun.semver', () => {
	expect(satisfiesVersion('1.2.3', '>=1.0.0 <2.0.0')).toBe(true);
	expect(satisfiesVersion('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
});
