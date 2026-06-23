import {expect, test, beforeEach, afterEach} from 'bun:test';
import {
	BUN_PTY_DOCS_URL,
	createSpawnTerminalOptions,
	PTY_SPAWN_BEHAVIOR,
	spawnPtyProcess,
} from '../../src/scan/terminal.ts';

let originalSpawn: typeof Bun.spawn;

beforeEach(() => {
	originalSpawn = Bun.spawn;
});

afterEach(() => {
	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = originalSpawn;
});

test('createSpawnTerminalOptions supports exit and drain callbacks', () => {
	let drained = false;
	let exited = -1;
	const options = createSpawnTerminalOptions({
		onData: () => {},
		onDrain: () => {
			drained = true;
		},
		onExit: (_term, code) => {
			exited = code;
		},
	});

	expect(options.exit).toBeDefined();
	expect(options.drain).toBeDefined();
	options.drain?.({} as import('../../src/scan/terminal.ts').PtyTerminal);
	options.exit?.({} as import('../../src/scan/terminal.ts').PtyTerminal, 0);
	expect(drained).toBe(true);
	expect(exited).toBe(0);
});

test('PTY_SPAWN_BEHAVIOR documents Bun terminal semantics', () => {
	expect(PTY_SPAWN_BEHAVIOR.subprocessStreamsNull).toBe(true);
	expect(BUN_PTY_DOCS_URL).toContain('terminal-pty-support');
});

test('spawnPtyProcess uses terminal option and spawnEnvWithTerm', async () => {
	let spawnOptions: Record<string, unknown> | undefined;
	const terminal = {
		write: () => {},
		resize: () => {},
		close: () => {},
		setRawMode: () => {},
	};

	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = ((
		cmdOrOptions: Parameters<typeof Bun.spawn>[0],
		options?: Parameters<typeof Bun.spawn>[1],
	) => {
		spawnOptions = (
			typeof cmdOrOptions === 'object' && cmdOrOptions !== null && 'cmd' in cmdOrOptions
				? cmdOrOptions
				: options
		) as Record<string, unknown>;
		(spawnOptions?.terminal as {data?: Function})?.data?.(terminal, new TextEncoder().encode('ok'));

		return {
			exited: Promise.resolve(0),
			terminal,
			pid: 4242,
			killed: false,
			signalCode: null,
			exitCode: 0,
		} as unknown as ReturnType<typeof Bun.spawn>;
	}) as typeof Bun.spawn;

	const result = await spawnPtyProcess(['echo', 'hi'], {stdin: false});
	expect(result.exitCode).toBe(0);
	expect(result.pid).toBe(4242);
	expect(spawnOptions?.terminal).toBeDefined();
	expect((spawnOptions?.env as Record<string, string>).TERM).toBeTruthy();
	expect((spawnOptions?.env as Record<string, string>).COLORTERM).toBeTruthy();
});
