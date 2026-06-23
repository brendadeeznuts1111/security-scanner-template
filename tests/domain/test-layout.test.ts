import {expect, test} from 'bun:test';
import {
	isApprovedTestPath,
	testSliceFilter,
	TEST_TOP_LEVEL_SLICES,
} from '../../src/domain/test-layout.ts';

test('testSliceFilter appends trailing slash for bun test discovery', () => {
	expect(testSliceFilter('network')).toBe('network/');
	expect(testSliceFilter('domain-runtime')).toBe('domain-runtime/');
});

test('isApprovedTestPath accepts slice tests and root support files', () => {
	expect(isApprovedTestPath('network/loop.test.ts')).toBe(true);
	expect(isApprovedTestPath('domain-runtime/vault.test.ts')).toBe(true);
	expect(isApprovedTestPath('conventions/bun/bun-test-api.test.ts')).toBe(true);
	expect(isApprovedTestPath('helpers.ts')).toBe(true);
	expect(isApprovedTestPath('setup.ts')).toBe(true);
	expect(isApprovedTestPath('orphan.test.ts')).toBe(false);
});

test('TEST_TOP_LEVEL_SLICES includes domain-runtime and conventions', () => {
	expect(TEST_TOP_LEVEL_SLICES as readonly string[]).toContain('domain-runtime');
	expect(TEST_TOP_LEVEL_SLICES as readonly string[]).toContain('conventions');
});