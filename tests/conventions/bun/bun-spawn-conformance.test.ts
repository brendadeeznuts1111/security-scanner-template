/**
 * @see https://bun.com/docs/guides/process/spawn
 * @see https://bun.com/docs/guides/process/spawn-stdout
 */
import {expect, test} from 'bun:test';
import {
	BUN_SPAWN_GUIDE_URL,
	BUN_SPAWN_STDOUT_DOCS_URL,
	isSpawnAvailable,
	readSpawnStdout,
	spawnAndWait,
	spawnChild,
	spawnStdoutText,
} from '../../../src/utils/process.ts';

test('spawn guide awaits proc.exited', async () => {
	const proc = spawnChild(['echo', 'hello']);
	await proc.exited;
	expect(proc.exitCode).toBe(0);
});

test('spawn stdout guide reads piped text', async () => {
	const result = await spawnStdoutText(['echo', 'hello']);
	expect(result.exitCode).toBe(0);
	expect(result.stdout.trim()).toBe('hello');
});

test('readSpawnStdout matches proc.stdout.text pattern', async () => {
	const proc = spawnChild(['echo', 'hello']);
	const [exitCode, output] = await Promise.all([proc.exited, readSpawnStdout(proc)]);
	expect(exitCode).toBe(0);
	expect(output.trim()).toBe('hello');
});

test('spawnAndWait returns exit code after completion', async () => {
	const result = await spawnAndWait(['echo', 'ok'], {env: {SPAWN_TEST: '1'}});
	expect(result.exitCode).toBe(0);
	expect(result.proc.exitCode).toBe(0);
});

test('isSpawnAvailable reflects Bun.spawn presence', () => {
	expect(isSpawnAvailable()).toBe(typeof Bun.spawn === 'function');
});

test('docs URLs point at spawn guides', () => {
	expect(BUN_SPAWN_GUIDE_URL).toBe('https://bun.com/docs/guides/process/spawn');
	expect(BUN_SPAWN_STDOUT_DOCS_URL).toContain('spawn-stdout');
});
