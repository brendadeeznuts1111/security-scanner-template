import {expect, test} from 'bun:test';
import path from 'path';
import {isValidTestDescription, isValidTestFilePath} from '../../src/domain/naming.ts';

const TESTS_ROOT = path.join(import.meta.dir, '..');

const TEST_CALL_PATTERN = /(?<![.\w])test(?:\.only|\.skip|\.todo)?\s*\(\s*(['"`])([^'"`\n]+)\1/g;

test('test files use the .test.ts suffix under tests/', async () => {
	const glob = new Bun.Glob('**/*');
	const violations: string[] = [];
	for (const relative of glob.scanSync({cwd: TESTS_ROOT})) {
		if (!relative.endsWith('.ts') || relative.endsWith('.test.ts')) continue;
		if (relative.includes('/')) continue;
		if (relative === 'helpers.ts' || relative === 'setup.ts' || relative.endsWith('.helper.ts')) {
			continue;
		}
		violations.push(relative);
	}
	expect(violations).toEqual([]);
});

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
