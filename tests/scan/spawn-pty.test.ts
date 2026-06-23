import {expect, test, beforeEach, afterEach} from 'bun:test';
import {
	BUN_PTY_DOCS_URL,
	createSpawnTerminalOptions,
	createTerminal,
	isBunTerminal,
	isTerminalOptions,
	PTY_SPAWN_BEHAVIOR,
	resolveSpawnTerminal,
	spawnPtyProcess,
} from '../../src/scan/terminal.ts';
import {TERM_ENV_NOTE} from '../../src/utils/process.ts';

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
	let signal: string | null = 'pending';
	const options = createSpawnTerminalOptions({
		onData: () => {},
		onDrain: () => {
			drained = true;
		},
		onExit: (_term, code, sig) => {
			exited = code;
			signal = sig;
		},
	});

	expect(options.exit).toBeDefined();
	expect(options.drain).toBeDefined();
	options.drain?.({} as Bun.Terminal);
	options.exit?.({} as Bun.Terminal, 0, null);
	expect(drained).toBe(true);
	expect(exited).toBe(0);
	expect(signal).toBeNull();
});

test('createTerminal returns Bun.Terminal with defaults', () => {
	if (typeof Bun.Terminal !== 'function') {
		return;
	}
	const terminal = createTerminal({cols: 100, rows: 30});
	expect(isBunTerminal(terminal)).toBe(true);
	expect(typeof terminal.write).toBe('function');
	expect(typeof terminal.resize).toBe('function');
	terminal.close();
});

test('resolveSpawnTerminal accepts reusable terminal or options', () => {
	const options = createSpawnTerminalOptions(() => {});
	expect(isTerminalOptions(resolveSpawnTerminal(options))).toBe(true);
	expect(resolveSpawnTerminal(options)).toBe(options);
});

test('PTY_SPAWN_BEHAVIOR documents Bun terminal semantics', () => {
	expect(PTY_SPAWN_BEHAVIOR.subprocessStreamsNull).toBe(true);
	expect(PTY_SPAWN_BEHAVIOR.termEnvSeparateFromName).toContain('spawnEnvWithTerm');
	expect(BUN_PTY_DOCS_URL).toContain('terminal-pty-support');
	expect(TERM_ENV_NOTE).toContain('terminal.name');
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

test('spawnPtyProcess reuses Bun.Terminal without closing it', async () => {
	if (typeof Bun.Terminal !== 'function') {
		return;
	}

	let closed = false;
	const reusable = createTerminal();
	const originalClose = reusable.close.bind(reusable);
	reusable.close = () => {
		closed = true;
		originalClose();
	};

	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = () =>
		({
			exited: Promise.resolve(0),
			terminal: reusable,
			pid: 1,
			killed: false,
			signalCode: null,
		}) as unknown as ReturnType<typeof Bun.spawn>;

	await spawnPtyProcess(['echo', 'hi'], {
		stdin: false,
		terminal: reusable,
	});

	expect(closed).toBe(false);
	reusable.close();
});
