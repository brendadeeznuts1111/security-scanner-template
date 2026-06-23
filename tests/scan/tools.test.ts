import {expect, test, beforeEach, afterEach} from 'bun:test';
import {detectTool, detectTools, runTool} from '../../src/scan/tools.ts';

let originalWhich: typeof Bun.which;
let originalSpawn: typeof Bun.spawn;

beforeEach(() => {
	originalWhich = Bun.which;
	originalSpawn = Bun.spawn;
});

afterEach(() => {
	(Bun as unknown as {which: typeof Bun.which}).which = originalWhich;
	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = originalSpawn;
});

test('detectTool uses Bun.which', () => {
	(Bun as unknown as {which: typeof Bun.which}).which = ((name: string) =>
		name === 'bun' ? '/usr/bin/bun' : null) as typeof Bun.which;

	expect(detectTool('bun')).toBe('/usr/bin/bun');
	expect(detectTool('missing-tool')).toBeNull();
});

test('detectTools reports availability for each tool', () => {
	(Bun as unknown as {which: typeof Bun.which}).which = ((name: string) =>
		name === 'trivy' ? '/usr/bin/trivy' : null) as typeof Bun.which;

	const tools = detectTools(['trivy', 'snyk']);
	expect(tools).toEqual([
		{name: 'trivy', available: true, path: '/usr/bin/trivy'},
		{name: 'snyk', available: false, path: null},
	]);
});

test('runTool spawns detected executable', async () => {
	(Bun as unknown as {which: typeof Bun.which}).which = (() =>
		'/usr/bin/mock-tool') as typeof Bun.which;
	let capturedTimeout: number | undefined;
	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = ((
		_cmd: Parameters<typeof Bun.spawn>[0],
		options?: Parameters<typeof Bun.spawn>[1],
	) => {
		capturedTimeout = (options as {timeout?: number})?.timeout;
		return {
			exited: Promise.resolve(0),
			stdout: new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('ok'));
					controller.close();
				},
			}),
			stderr: new ReadableStream({
				start(controller) {
					controller.close();
				},
			}),
			killed: false,
			signalCode: null,
			kill: () => {},
		} as unknown as ReturnType<typeof Bun.spawn>;
	}) as typeof Bun.spawn;

	const result = await runTool('mock-tool', {args: ['--version'], timeoutMs: 12_000});
	expect(result.exitCode).toBe(0);
	expect(result.stdout).toBe('ok');
	expect(result.command).toBe('/usr/bin/mock-tool');
	expect(result.killed).toBe(false);
	expect(capturedTimeout).toBe(12_000);
});
