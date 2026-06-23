/**
 * Regression tests for Bun Shell fixes:
 * - cd reports non-ENOENT errors (EACCES, ELOOP, ENAMETOOLONG) and exits instead of hanging
 * - $.cwd() / cd reject paths longer than 4096 bytes without crashing
 * - [[ -f path ]] matches only regular files
 * - tilde expansion preserves segments after command substitutions
 */
import {expect, test, beforeEach, afterEach} from 'bun:test';
import {$} from 'bun';
import {chmod, mkdtemp, mkdir, rm, symlink, writeFile} from 'fs/promises';
import {execSync} from 'node:child_process';
import path from 'path';
import os from 'node:os';

const SHELL_TIMEOUT_MS = 3_000;
const LONG_PATH_BYTES = 5_000;

async function shellCompletesWithin<T>(promise: Promise<T>, ms = SHELL_TIMEOUT_MS): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => {
			setTimeout(() => reject(new Error(`Bun Shell hung longer than ${ms}ms`)), ms);
		}),
	]);
}

let tmpDir = '';

beforeEach(async () => {
	tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bun-shell-fixes-'));
});

afterEach(async () => {
	// $.cwd() sets a global default; restore after each test.
	$.cwd(process.cwd());

	if (tmpDir) {
		await chmod(tmpDir, 0o755).catch(() => {});
		await rm(tmpDir, {recursive: true, force: true}).catch(() => {});
		tmpDir = '';
	}
});

test('cd reports EACCES to stderr and exits 1 without hanging', async () => {
	const locked = path.join(tmpDir, 'locked');
	await mkdir(locked);
	await chmod(locked, 0o000);

	const result = await shellCompletesWithin(
		$`cd ${path.join(locked, 'inside')}`.nothrow().quiet(),
	);

	expect(result.exitCode).toBe(1);
	expect(result.stderr.toString()).toMatch(/Permission denied|EACCES/i);

	await chmod(locked, 0o755);
});

test('cd reports ELOOP to stderr and exits 1 without hanging', async () => {
	const loop = path.join(tmpDir, 'loop');
	await symlink('loop', loop);
	const deep = path.join(loop, 'loop', 'loop', 'loop');

	const result = await shellCompletesWithin($`cd ${deep}`.nothrow().quiet());

	expect(result.exitCode).toBe(1);
	expect(result.stderr.toString()).toMatch(/Too many levels of symbolic links|ELOOP/i);
});

test('cd reports ENAMETOOLONG for paths longer than 4096 bytes', async () => {
	const longPath = path.join(tmpDir, 'a'.repeat(LONG_PATH_BYTES));

	const result = await shellCompletesWithin($`cd ${longPath}`.nothrow().quiet());

	expect(result.exitCode).toBe(1);
	expect(result.stderr.toString()).toMatch(/file name too long|ENAMETOOLONG/i);
});

test('$.cwd() rejects paths longer than 4096 bytes with ENAMETOOLONG', async () => {
	const longPath = 'b'.repeat(LONG_PATH_BYTES);

	let caught: unknown;
	try {
		await shellCompletesWithin($.cwd(longPath)`pwd`.quiet());
	} catch (error) {
		caught = error;
	}

	expect(caught).toBeDefined();
	const message = caught instanceof Error ? caught.message : String(caught);
	expect(message).toMatch(/file name too long|ENAMETOOLONG/i);
});

test('[[ -f path ]] is true only for regular files', async () => {
	const regular = path.join(tmpDir, 'regular.txt');
	const directory = path.join(tmpDir, 'subdir');
	const fifo = path.join(tmpDir, 'pipe');

	await writeFile(regular, 'ok');
	await mkdir(directory);
	execSync(`mkfifo ${fifo}`);

	const fileResult = await $`[[ -f ${regular} ]] && echo file-yes || echo file-no`.text();
	const dirResult = await $`[[ -f ${directory} ]] && echo dir-yes || echo dir-no`.text();
	const fifoResult = await $`[[ -f ${fifo} ]] && echo fifo-yes || echo fifo-no`.text();
	const devResult = await $`[[ -f /dev/null ]] && echo dev-yes || echo dev-no`.text();

	expect(fileResult.trim()).toBe('file-yes');
	expect(dirResult.trim()).toBe('dir-no');
	expect(fifoResult.trim()).toBe('fifo-no');
	expect(devResult.trim()).toBe('dev-no');
});

test('tilde expansion keeps path segments after command substitutions', async () => {
	const home = process.env.HOME;
	if (!home) {
		expect(true).toBe(true);
		return;
	}

	const output = await $`echo ~/$(echo bin)/subdir`.text();
	const expected = path.join(home, 'bin', 'subdir');

	expect(output.trim()).toBe(expected);
});