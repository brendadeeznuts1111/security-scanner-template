import {expect, test} from 'bun:test';
import {VersionMatcher} from '../../src/semver/index.ts';

test('satisfies delegates to Bun.semver', () => {
	expect(VersionMatcher.satisfies('1.2.3', '>=1.0.0 <2.0.0')).toBe(true);
	expect(VersionMatcher.satisfies('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
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

test('compare orders versions', () => {
	expect(VersionMatcher.compare('1.0.0', '2.0.0')).toBe(-1);
	expect(VersionMatcher.compare('2.0.0', '1.0.0')).toBe(1);
	expect(VersionMatcher.compare('1.0.0', '1.0.0')).toBe(0);
});
