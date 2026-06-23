import {expect, test} from 'bun:test';
import {
	PROFILES,
	profileDescription,
	profileFeatures,
	isBuildProfile,
} from '../../src/build/profiles.ts';
import {buildFeatureArgs} from '../../src/features/index.ts';

test('PROFILES define agent, server, and dev feature sets', () => {
	expect(PROFILES.agent).toEqual(['AUDIT_JSONL', 'INTEL_DNS', 'SCAN_EXTERNAL']);
	expect(PROFILES.server).toEqual(['AUDIT_SQLITE', 'REPORT_HTML', 'CACHE_REDIS', 'INTEL_DNS']);
	expect(PROFILES.dev).toContain('DEBUG');
	expect(PROFILES.dev).toContain('MOCK_API');
	expect(PROFILES.dev).toContain('FEED_WEBSOCKET');
});

test('isBuildProfile validates profile names', () => {
	expect(isBuildProfile('agent')).toBe(true);
	expect(isBuildProfile('server')).toBe(true);
	expect(isBuildProfile('dev')).toBe(true);
	expect(isBuildProfile('staging')).toBe(false);
});

test('profileFeatures returns a copy of the profile list', () => {
	const features = profileFeatures('agent');
	expect(features).toEqual([...PROFILES.agent]);
	features.push('DEBUG');
	expect(PROFILES.agent).not.toContain('DEBUG');
});

test('profileDescription returns human-readable text', () => {
	expect(profileDescription('agent')).toContain('edge');
	expect(profileDescription('server').toLowerCase()).toContain('enterprise');
});

test('agent profile should emit --feature flags only for enabled features via buildFeatureArgs', () => {
	const args = buildFeatureArgs(new Set(profileFeatures('agent')));
	expect(args).toContain('--feature=AUDIT_JSONL');
	expect(args).toContain('--feature=INTEL_DNS');
	expect(args).toContain('--feature=SCAN_EXTERNAL');
	expect(args).not.toContain('--feature=AUDIT_SQLITE');
	expect(args).not.toContain('--feature=REPORT_HTML');
});