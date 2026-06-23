import {expect, test} from 'bun:test';
import path from 'path';
import {isValidTestDescription, isValidTestFilePath} from '../../src/domain/naming.ts';
import {isValidTestFileStem, topLevelTestSlice} from '../../src/domain/test-layout.ts';

const TESTS_ROOT = path.join(import.meta.dir, '..');

const TEST_CALL_PATTERN =
	/(?<![.\w])test(?:\.only|\.skip|\.todo|\.failing)?\s*\(\s*(['"`])([^'"`\n]+)\1/g;
const DESCRIBE_CALL_PATTERN =
	/(?<![.\w])describe(?:\.only|\.skip|\.serial|\.concurrent)?\s*\(\s*(['"`])([^'"`\n]+)\1/g;

test('test descriptions follow lowercase plain-language convention', async () => {
	const glob = new Bun.Glob('**/*.test.ts');
	const violations: {file: string; description: string}[] = [];

	for (const relative of glob.scanSync({cwd: TESTS_ROOT})) {
		const filePath = path.join(TESTS_ROOT, relative);
		if (!isValidTestFilePath(filePath)) continue;
		const text = await Bun.file(filePath).text();
		for (const match of text.matchAll(TEST_CALL_PATTERN)) {
			const description = match[2] ?? '';
			if (!isValidTestDescription(description)) {
				violations.push({file: relative, description});
			}
		}
	}

	expect(violations).toEqual([]);
});

test('describe blocks use plain-language titles', async () => {
	const glob = new Bun.Glob('**/*.test.ts');
	const violations: {file: string; description: string}[] = [];

	for (const relative of glob.scanSync({cwd: TESTS_ROOT})) {
		const filePath = path.join(TESTS_ROOT, relative);
		const text = await Bun.file(filePath).text();
		for (const match of text.matchAll(DESCRIBE_CALL_PATTERN)) {
			const description = match[2] ?? '';
			if (!isValidTestDescription(description)) {
				violations.push({file: relative, description});
			}
		}
	}

	expect(violations).toEqual([]);
});

test('slice directory names align with test file stems', () => {
	const glob = new Bun.Glob('**/*.test.ts');
	for (const relative of glob.scanSync({cwd: TESTS_ROOT})) {
		const slice = topLevelTestSlice(relative);
		const stem = path.basename(relative, '.test.ts');
		expect(isValidTestFileStem(`${stem}.test.ts`)).toBe(true);
		if (slice === 'conventions' && relative.includes('/bun/')) {
			expect(stem.startsWith('bun-') || stem === 'concurrent-time').toBe(true);
		}
	}
});
