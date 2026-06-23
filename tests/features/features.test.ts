import {expect, test} from 'bun:test';
import {ALL_FEATURES, buildFeatureArgs, parseFeatureList} from '../../src/features/index.ts';

test('ALL_FEATURES should list every registered compile-time feature gate', () => {
	expect(ALL_FEATURES).toEqual([
		'AUDIT_SQLITE',
		'AUDIT_JSONL',
		'INTEL_DNS',
		'REPORT_MARKDOWN',
		'REPORT_HTML',
		'CACHE_REDIS',
		'FEED_WEBSOCKET',
		'SCAN_EXTERNAL',
		'DEBUG',
		'MOCK_API',
	]);
});

test('parseFeatureList should parse a comma-separated list of feature names', () => {
	expect(parseFeatureList('AUDIT_SQLITE,INTEL_DNS')).toEqual(['AUDIT_SQLITE', 'INTEL_DNS']);
});

test('parseFeatureList should default to all features when input is empty or undefined', () => {
	expect(parseFeatureList(undefined)).toEqual([...ALL_FEATURES]);
});

test('buildFeatureArgs should emit --feature flags only for enabled features', () => {
	const enabled = new Set(['AUDIT_SQLITE', 'INTEL_DNS'] as const);
	const args = buildFeatureArgs(enabled);
	expect(args).toContain('--feature=AUDIT_SQLITE');
	expect(args).toContain('--feature=INTEL_DNS');
	expect(args).not.toContain('--feature=AUDIT_JSONL');
	expect(args).not.toContain('--feature=REPORT_HTML');
});
