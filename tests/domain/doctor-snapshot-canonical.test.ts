import {expect, test} from 'bun:test';
import {canonicalSerialize, fingerprintFromSections} from '../../src/domain/doctor-snapshot-canonical.ts';
import {computeDomainFingerprint} from '../../src/domain/doctor-snapshot-deep.ts';
import {buildDomainSnapshot} from '../../src/domain/doctor-snapshot.ts';

test('canonicalSerialize sorts object keys and serializes null as empty string', () => {
	expect(canonicalSerialize(null)).toBe('""');
	expect(canonicalSerialize({b: 1, a: 2})).toBe('{"a":2,"b":1}');
});

test('computeDomainFingerprint changes when bundles section changes', () => {
	const base = buildDomainSnapshot({
		domain: 'com.example.bundles',
		path: '/tmp/com.example.bundles.security.json5',
		ok: true,
		issues: [],
	});
	const withBundles = buildDomainSnapshot(
		{
			domain: 'com.example.bundles',
			path: '/tmp/com.example.bundles.security.json5',
			ok: true,
			issues: [],
		},
		{
			bundles: {
				path: 'dist',
				hash: 'abc',
				fileCount: 1,
				lastScan: '2020-01-01T00:00:00.000Z',
			},
		},
	);

	expect(computeDomainFingerprint(base)).not.toBe(computeDomainFingerprint(withBundles));
	expect(fingerprintFromSections([1, 2])).toMatch(/^[a-f0-9]{64}$/);
});