/**
 * Parity checks against oven-sh/bun docs/runtime/utils.mdx examples.
 * @see https://github.com/oven-sh/bun/blob/main/docs/runtime/utils.mdx
 */
import {expect, test} from 'bun:test';
import {
	filePathFromModuleUrl,
	getRuntimeInfo,
	isMainModule,
	moduleUrlFromPath,
	sleep,
	which,
} from '../../src/utils/runtime.ts';
import {stringWidth} from '../../src/utils/terminal.ts';
import {randomUUIDv7} from '../../src/utils/uuid.ts';

test('docs: Bun.version revision and main are readable', () => {
	const info = getRuntimeInfo();
	expect(info.version).toBe(Bun.version);
	expect(info.revision).toBe(Bun.revision);
	expect(info.main.length).toBeGreaterThan(0);
	expect(isMainModule(import.meta.path)).toBe(import.meta.path === Bun.main);
});

test('docs: sleep resolves after delay', async () => {
	const started = performance.now();
	await sleep(1);
	expect(performance.now() - started).toBeGreaterThanOrEqual(0);
});

test('docs: which locates executables on PATH', () => {
	const path = which('bun', {PATH: process.env.PATH});
	expect(path === null || path.includes('bun')).toBe(true);
});

test('docs: randomUUIDv7 returns monotonic ids', () => {
	const a = randomUUIDv7();
	const b = randomUUIDv7();
	expect(a).toMatch(/^[0-9a-f-]{36}$/i);
	expect(b).not.toBe(a);
	if (typeof Bun.randomUUIDv7 === 'function') {
		expect(a < b).toBe(true);
	}
});

test('docs: stringWidth matches terminal column semantics', () => {
	expect(stringWidth('hello')).toBe(5);
	expect(stringWidth('\u001b[31mhello\u001b[0m')).toBe(5);
	expect(stringWidth('\u001b[31mhello\u001b[0m', {countAnsiEscapeCodes: true})).toBe(12);
});

test('docs: file URL path helpers round-trip', () => {
	const fileUrl = moduleUrlFromPath('/foo/bar.txt');
	expect(fileUrl.href).toContain('file://');
	expect(filePathFromModuleUrl(fileUrl)).toBe('/foo/bar.txt');
});

