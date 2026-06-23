import {expect, test, beforeEach, afterEach} from 'bun:test';
import {ToolRunner} from '../../src/scan/tools.ts';

let originalWhich: typeof Bun.which;
let originalSpawn: typeof Bun.spawn;
let written: Uint8Array[];

beforeEach(() => {
	originalWhich = Bun.which;
	originalSpawn = Bun.spawn;
	written = [];
});

afterEach(() => {
	(Bun as unknown as {which: typeof Bun.which}).which = originalWhich;
	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = originalSpawn;
});

test('ToolRunner.runWithPTY spawns with terminal options', async () => {
	(Bun as unknown as {which: typeof Bun.which}).which = (() =>
		'/usr/bin/trivy') as typeof Bun.which;

	let capturedTerminal: {
		cols: number;
		rows: number;
		write: (data: Uint8Array) => void;
		close: () => void;
		resize: (cols: number, rows: number) => void;
	} | null = null;

	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = ((
		cmdOrOptions: Parameters<typeof Bun.spawn>[0],
		options?: Parameters<typeof Bun.spawn>[1],
	) => {
		const spawnOptions = (
			typeof cmdOrOptions === 'object' && cmdOrOptions !== null && 'cmd' in cmdOrOptions
				? cmdOrOptions
				: options
		) as {
			terminal?: {cols: number; rows: number; name: string; data: Function};
			env?: Record<string, string>;
		};
		expect(spawnOptions.terminal?.cols).toBeGreaterThan(0);
		expect(spawnOptions.terminal?.rows).toBeGreaterThan(0);
		expect(spawnOptions.terminal?.name).toBe('xterm-256color');
		expect(spawnOptions.env?.TERM).toBeTruthy();

		capturedTerminal = {
			cols: spawnOptions.terminal!.cols,
			rows: spawnOptions.terminal!.rows,
			write: () => {},
			close: () => {},
			resize: () => {},
		};

		spawnOptions.terminal?.data(capturedTerminal, new TextEncoder().encode('scanning\n'));

		return {
			exited: Promise.resolve(0),
			terminal: capturedTerminal,
			kill: () => {},
		} as unknown as ReturnType<typeof Bun.spawn>;
	}) as typeof Bun.spawn;

	const runner = new ToolRunner();
	const result = await runner.runWithPTY('trivy', {args: ['image', 'alpine'], stdin: false});

	expect(result.command).toBe('/usr/bin/trivy');
	expect(result.args).toEqual(['image', 'alpine']);
	expect(result.exitCode).toBe(0);
	expect(capturedTerminal).not.toBeNull();
});

test('ToolRunner.runWithPTY throws when tool is missing', async () => {
	(Bun as unknown as {which: typeof Bun.which}).which = (() => null) as typeof Bun.which;

	const runner = new ToolRunner();
	await expect(runner.runWithPTY('missing-scanner')).rejects.toThrow('Tool not found');
});

test('ToolRunner.runInteractive delegates to runWithPTY', async () => {
	(Bun as unknown as {which: typeof Bun.which}).which = (() =>
		'/usr/bin/snyk') as typeof Bun.which;

	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = () =>
		({
			exited: Promise.resolve(2),
			terminal: {
				write: () => {},
				close: () => {},
				resize: () => {},
			},
			kill: () => {},
		}) as unknown as ReturnType<typeof Bun.spawn>;

	const runner = new ToolRunner();
	const result = await runner.runInteractive('snyk', {args: ['test']});
	expect(result.exitCode).toBe(2);
	expect(result.command).toBe('/usr/bin/snyk');
});