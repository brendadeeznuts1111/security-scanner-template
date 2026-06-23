#!/usr/bin/env bun
/**
 * Run a tests/ slice via Bun.Glob discovery (archive-style include/exclude).
 * @see src/domain/test-layout.ts
 * @see https://bun.com/docs/runtime/archive#filtering-with-glob-patterns
 */
import path from 'path';
import {
	listTestFilesForSlice,
	TEST_SLICE_GLOBS,
	type TestSliceId,
} from '../src/domain/test-layout.ts';

const slice = process.argv[2] as TestSliceId | undefined;
if (!slice || !(slice in TEST_SLICE_GLOBS)) {
	console.error(
		`usage: bun run scripts/test-slice.ts <${Object.keys(TEST_SLICE_GLOBS).join('|')}>`,
	);
	process.exit(1);
}

const projectRoot = path.join(import.meta.dir, '..');
const testsRoot = path.join(projectRoot, 'tests');
const files = await listTestFilesForSlice(testsRoot, slice);

if (files.length === 0) {
	console.error(`no tests matched slice "${slice}"`);
	process.exit(1);
}

const extraArgs = process.argv.slice(3);
const proc = Bun.spawn({
	cmd: ['bun', 'test', ...files, ...extraArgs],
	cwd: projectRoot,
	stdout: 'inherit',
	stderr: 'inherit',
});

process.exit(await proc.exited);
