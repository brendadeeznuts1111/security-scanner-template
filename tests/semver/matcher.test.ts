import {expect, test} from 'bun:test';
import {semver} from 'bun';
import {orderVersions, satisfiesVersion, VersionMatcher} from '../../src/semver/index.ts';

/** Official Bun semver doc examples — https://bun.com/docs/runtime/semver */
const SATISFIES_DOC_CASES: Array<{version: string; range: string; expected: boolean}> = [
	{version: '1.0.0', range: '^1.0.0', expected: true},
	{version: '1.0.0', range: '^1.0.1', expected: false},
	{version: '1.0.0', range: '~1.0.0', expected: true},
	{version: '1.0.0', range: '~1.0.1', expected: false},
	{version: '1.0.0', range: '1.0.0', expected: true},
	{version: '1.0.0', range: '1.0.1', expected: false},
	{version: '1.0.1', range: '1.0.0', expected: false},
	{version: '1.0.0', range: '1.0.x', expected: true},
	{version: '1.0.0', range: '1.x.x', expected: true},
	{version: '1.0.0', range: 'x.x.x', expected: true},
	{version: '1.0.0', range: '1.0.0 - 2.0.0', expected: true},
	{version: '1.0.0', range: '1.0.0 - 1.0.1', expected: true},
];

test('satisfiesVersion matches Bun.semver.satisfies doc examples', () => {
	for (const {version, range, expected} of SATISFIES_DOC_CASES) {
		expect(satisfiesVersion(version, range)).toBe(expected);
	}
});

test('satisfiesVersion agrees with Bun.semver.satisfies and import { semver } from "bun"', () => {
	for (const {version, range, expected} of SATISFIES_DOC_CASES) {
		expect(satisfiesVersion(version, range)).toBe(Bun.semver.satisfies(version, range));
		expect(satisfiesVersion(version, range)).toBe(semver.satisfies(version, range));
		expect(satisfiesVersion(version, range)).toBe(expected);
	}
});

test('satisfiesVersion returns false for invalid version strings', () => {
	expect(satisfiesVersion('not-a-version', '^1.0.0')).toBe(false);
	expect(satisfiesVersion('', '^1.0.0')).toBe(false);
});

test('satisfiesVersion returns false for malformed range strings Bun rejects', () => {
	expect(satisfiesVersion('1.0.0', '1.0.0 -')).toBe(false);
	expect(satisfiesVersion('1.0.0', 'v')).toBe(false);
});

test('orderVersions matches Bun.semver.order doc examples', () => {
	expect(orderVersions('1.0.0', '1.0.0')).toBe(0);
	expect(orderVersions('1.0.0', '1.0.1')).toBe(-1);
	expect(orderVersions('1.0.1', '1.0.0')).toBe(1);
	expect(orderVersions('1.0.0', '1.0.0')).toBe(Bun.semver.order('1.0.0', '1.0.0'));
	expect(orderVersions('1.0.0', '1.0.1')).toBe(semver.order('1.0.0', '1.0.1'));

	const unsorted = ['1.0.0', '1.0.1', '1.0.0-alpha', '1.0.0-beta', '1.0.0-rc'];
	unsorted.sort(orderVersions);
	expect(unsorted).toEqual(['1.0.0-alpha', '1.0.0-beta', '1.0.0-rc', '1.0.0', '1.0.1']);
});

test('isCompatible applies lower/upper bounds and excludes', () => {
	expect(VersionMatcher.isCompatible('1.5.0', {min: '1.0.0', max: '2.0.0'})).toBe(true);
	expect(VersionMatcher.isCompatible('2.1.0', {min: '1.0.0', max: '2.0.0'})).toBe(false);
	expect(VersionMatcher.isCompatible('1.2.0', {min: '1.0.0', exclude: ['1.2.0']})).toBe(false);
	expect(VersionMatcher.isCompatible('1.3.0', {include: ['^1.0.0', '^2.0.0']})).toBe(true);
	expect(VersionMatcher.isCompatible('3.0.0', {include: ['^1.0.0', '^2.0.0']})).toBe(false);
});

test('latestSatisfying returns the newest matching version', () => {
	const versions = ['1.0.0', '1.2.0', '1.5.0', '2.0.0', '2.1.0'];
	expect(VersionMatcher.latestSatisfying(versions, '^1.0.0')).toBe('1.5.0');
	expect(VersionMatcher.latestSatisfying(versions, '>=2.0.0')).toBe('2.1.0');
	expect(VersionMatcher.latestSatisfying(versions, '3.0.0')).toBeNull();
});

test('compare orders versions via orderVersions', () => {
	expect(VersionMatcher.compare('1.0.0', '2.0.0')).toBe(-1);
	expect(VersionMatcher.compare('2.0.0', '1.0.0')).toBe(1);
	expect(VersionMatcher.compare('1.0.0', '1.0.0')).toBe(0);
});
