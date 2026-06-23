import {expect, test} from 'bun:test';
import {
	BUN_SPAWN_DOCS_URL,
	BUN_SPAWN_GUIDE_URL,
	BUN_SPAWN_STDOUT_DOCS_URL,
	DEFAULT_COLORTERM,
	DEFAULT_TERM_NAME,
	FORCE_COLOR_ENV,
	INTERACTIVE_FORCE_ENV,
	NO_COLOR_ENV,
	SPAWN_STDIO_DEFAULTS,
	exitIfNotInteractive,
	formatRuntimeInfoTable,
	getProcessRuntimeInfo,
	isInteractiveForced,
	isInteractiveSession,
	readSpawnStdout,
	requireInteractiveSession,
	resolveHumanStdout,
	resolveSpawnStdout,
	shouldColorize,
	spawnAndWait,
	spawnCaptured,
	spawnChild,
	spawnEnvWithTerm,
	spawnInherit,
	spawnStdoutCaptured,
	spawnStdoutText,
	writeJsonStdout,
	type SpawnOnExitHandler,
} from '../../src/utils/process.ts';

test('getProcessRuntimeInfo reports Bun spawn and terminal APIs', () => {
	const info = getProcessRuntimeInfo();
	expect(info.spawnAvailable).toBe(typeof Bun.spawn === 'function');
	expect(info.terminalAvailable).toBe(typeof Bun.Terminal === 'function');
	expect(info.platform).toBe(process.platform);
	expect(info.docsUrl).toBe(BUN_SPAWN_DOCS_URL);
	expect(info.spawnGuideUrl).toBe(BUN_SPAWN_GUIDE_URL);
	expect(info.interactiveSession).toBe(isInteractiveSession());
	expect(info.bunVersion).toBe(Bun.version);
	expect(info.bunRevision).toBe(Bun.revision);
	expect(info.stdinIsTTY).toBe(Boolean(process.stdin.isTTY));
	expect(info.stdoutIsTTY).toBe(Boolean(process.stdout.isTTY));
});

test('spawnEnvWithTerm sets TERM and COLORTERM when missing', () => {
	const originalTerm = process.env.TERM;
	const originalColorterm = process.env.COLORTERM;
	try {
		delete process.env.TERM;
		delete process.env.COLORTERM;
		const env = spawnEnvWithTerm({FOO: 'bar'});
		expect(env.TERM).toBe(DEFAULT_TERM_NAME);
		expect(env.COLORTERM).toBe(DEFAULT_COLORTERM);
		expect(env.FOO).toBe('bar');
	} finally {
		if (originalTerm === undefined) {
			delete process.env.TERM;
		} else {
			process.env.TERM = originalTerm;
		}
		if (originalColorterm === undefined) {
			delete process.env.COLORTERM;
		} else {
			process.env.COLORTERM = originalColorterm;
		}
	}
});

test('resolveHumanStdout prefers stderr when stdout is piped', () => {
	const stream = resolveHumanStdout();
	if (process.stdout.isTTY) {
		expect(stream).toBe(process.stdout);
	} else {
		expect(stream).toBe(process.stderr);
	}
});

test('resolveSpawnStdout matches stdout TTY state', () => {
	expect(resolveSpawnStdout()).toBe(process.stdout.isTTY ? 'inherit' : 'pipe');
});

test('SPAWN_STDIO_DEFAULTS matches Bun spawn guide', () => {
	expect(SPAWN_STDIO_DEFAULTS.stdout).toBe('pipe');
	expect(SPAWN_STDIO_DEFAULTS.stderr).toBe('inherit');
	expect(BUN_SPAWN_GUIDE_URL).toContain('/guides/process/spawn');
	expect(BUN_SPAWN_STDOUT_DOCS_URL).toContain('spawn-stdout');
});

test('shouldColorize honors FORCE_COLOR and NO_COLOR', () => {
	const prevForce = process.env[FORCE_COLOR_ENV];
	const prevNo = process.env[NO_COLOR_ENV];
	try {
		delete process.env[FORCE_COLOR_ENV];
		delete process.env[NO_COLOR_ENV];
		expect(shouldColorize(process.stderr)).toBe(Boolean(process.stderr.isTTY));

		process.env[FORCE_COLOR_ENV] = '1';
		expect(shouldColorize({isTTY: false} as NodeJS.WriteStream)).toBe(true);

		process.env[NO_COLOR_ENV] = '1';
		expect(shouldColorize({isTTY: true} as NodeJS.WriteStream)).toBe(false);
	} finally {
		if (prevForce === undefined) {
			delete process.env[FORCE_COLOR_ENV];
		} else {
			process.env[FORCE_COLOR_ENV] = prevForce;
		}
		if (prevNo === undefined) {
			delete process.env[NO_COLOR_ENV];
		} else {
			process.env[NO_COLOR_ENV] = prevNo;
		}
	}
});

test('formatRuntimeInfoTable includes bun version row', () => {
	const table = formatRuntimeInfoTable();
	expect(table).toContain('Bun.spawn');
	expect(table).toContain(Bun.version);
});

test('exitIfNotInteractive terminates when session is not interactive', () => {
	if (isInteractiveSession()) {
		return;
	}

	const originalExit = process.exit;
	let exitCode: number | undefined;
	process.exit = (code?: number) => {
		exitCode = code ?? 0;
		throw new Error('process.exit');
	};

	try {
		expect(() => exitIfNotInteractive('unit test')).toThrow('process.exit');
		expect(exitCode).toBe(1);
	} finally {
		process.exit = originalExit;
	}
});

test('requireInteractiveSession allows force env override', () => {
	const prev = process.env[INTERACTIVE_FORCE_ENV];
	process.env[INTERACTIVE_FORCE_ENV] = '1';
	try {
		expect(() => requireInteractiveSession('unit test')).not.toThrow();
		expect(isInteractiveForced()).toBe(true);
	} finally {
		if (prev === undefined) {
			delete process.env[INTERACTIVE_FORCE_ENV];
		} else {
			process.env[INTERACTIVE_FORCE_ENV] = prev;
		}
	}
});

test('spawnCaptured pipes stdout/stderr and honors timeout', async () => {
	const originalSpawn = Bun.spawn;
	let spawnOptions: Record<string, unknown> | undefined;

	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = ((
		_cmd: Parameters<typeof Bun.spawn>[0],
		options?: Parameters<typeof Bun.spawn>[1],
	) => {
		spawnOptions = options as Record<string, unknown>;
		return {
			exited: Promise.resolve(0),
			stdout: new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('out'));
					controller.close();
				},
			}),
			stderr: new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('err'));
					controller.close();
				},
			}),
			killed: false,
			signalCode: null,
		} as unknown as ReturnType<typeof Bun.spawn>;
	}) as typeof Bun.spawn;

	try {
		const result = await spawnCaptured(['tool', '--version'], {timeout: 5_000});
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe('out');
		expect(result.stderr).toBe('err');
		expect(result.timedOut).toBe(false);
		expect(spawnOptions?.timeout).toBe(5_000);
		expect(spawnOptions?.stdout).toBe('pipe');
		expect((spawnOptions?.env as Record<string, string>).COLORTERM).toBeTruthy();
	} finally {
		(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = originalSpawn;
	}
});

test('writeJsonStdout emits JSON on stdout', () => {
	const lines: string[] = [];
	const original = console.log;
	console.log = (line: string) => {
		lines.push(line);
	};
	try {
		writeJsonStdout({ok: true});
		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0]!)).toEqual({ok: true});
	} finally {
		console.log = original;
	}
});

test('spawnChild uses guide defaults and spawnAndWait awaits exited', async () => {
	const originalSpawn = Bun.spawn;
	let spawnOptions: Record<string, unknown> | undefined;
	let onExitCalled = false;

	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = ((
		_cmd: Parameters<typeof Bun.spawn>[0],
		options?: Parameters<typeof Bun.spawn>[1],
	) => {
		spawnOptions = options as Record<string, unknown>;
		const proc = {
			exited: Promise.resolve(0),
			stdout: new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('hello\n'));
					controller.close();
				},
			}),
			killed: false,
			signalCode: null,
		} as unknown as ReturnType<typeof Bun.spawn>;
		const onExit = options?.onExit as SpawnOnExitHandler | undefined;
		onExit?.(proc, 0, null);
		return proc;
	}) as typeof Bun.spawn;

	try {
		spawnChild(['echo', 'warmup']);
		const result = await spawnAndWait(['echo', 'hello'], {
			cwd: '/tmp',
			env: {FOO: 'bar'},
			onExit: () => {
				onExitCalled = true;
			},
		});
		expect(result.exitCode).toBe(0);
		expect(result.proc).toBeDefined();
		expect(spawnOptions?.cwd).toBe('/tmp');
		expect((spawnOptions?.env as Record<string, string>).FOO).toBe('bar');
		expect(spawnOptions?.stdout).toBe('pipe');
		expect(spawnOptions?.stderr).toBe('inherit');
		expect(onExitCalled).toBe(true);
	} finally {
		(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = originalSpawn;
	}
});

test('spawnStdoutText reads piped stdout like proc.stdout.text()', async () => {
	const originalSpawn = Bun.spawn;

	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = ((
		_cmd: Parameters<typeof Bun.spawn>[0],
		_options?: Parameters<typeof Bun.spawn>[1],
	) =>
		({
			exited: Promise.resolve(0),
			stdout: new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('hello\n'));
					controller.close();
				},
			}),
			killed: false,
			signalCode: null,
		}) as unknown as ReturnType<typeof Bun.spawn>) as typeof Bun.spawn;

	try {
		const result = await spawnStdoutText(['echo', 'hello']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe('hello\n');
	} finally {
		(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = originalSpawn;
	}
});

test('readSpawnStdout and spawnStdoutCaptured follow stdout guide', async () => {
	const originalSpawn = Bun.spawn;
	let spawnOptions: Record<string, unknown> | undefined;

	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = ((
		_cmd: Parameters<typeof Bun.spawn>[0],
		options?: Parameters<typeof Bun.spawn>[1],
	) => {
		spawnOptions = options as Record<string, unknown>;
		return {
			exited: Promise.resolve(0),
			stdout: new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('hello'));
					controller.close();
				},
			}),
			killed: false,
			signalCode: null,
		} as unknown as ReturnType<typeof Bun.spawn>;
	}) as typeof Bun.spawn;

	try {
		const proc = spawnStdoutCaptured(['echo', 'hello']);
		expect(await readSpawnStdout(proc)).toBe('hello');
		expect(spawnOptions?.stdout).toBe('pipe');
		expect(spawnOptions?.stderr).toBe('inherit');
		expect(spawnOptions?.stdin).toBeNull();
	} finally {
		(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = originalSpawn;
	}
});

test('spawnInherit configures inherited stdio and returns exit metadata', async () => {
	const originalSpawn = Bun.spawn;
	let spawnOptions: Record<string, unknown> | undefined;

	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = ((
		_cmd: Parameters<typeof Bun.spawn>[0],
		options?: Parameters<typeof Bun.spawn>[1],
	) => {
		spawnOptions = options as Record<string, unknown>;
		return {
			exited: Promise.resolve(0),
			killed: false,
			signalCode: null,
		} as unknown as ReturnType<typeof Bun.spawn>;
	}) as typeof Bun.spawn;

	try {
		const result = await spawnInherit(['echo', 'ok'], {env: {SCANNER_TEST: '1'}});
		expect(result.exitCode).toBe(0);
		expect(result.killed).toBe(false);
		expect(spawnOptions?.stdin).toBe('inherit');
		expect(spawnOptions?.stdout).toBe('inherit');
		expect(spawnOptions?.stderr).toBe('inherit');
		expect((spawnOptions?.env as Record<string, string>).SCANNER_TEST).toBe('1');
		expect((spawnOptions?.env as Record<string, string>).TERM).toBeTruthy();
		expect((spawnOptions?.env as Record<string, string>).COLORTERM).toBeTruthy();
	} finally {
		(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = originalSpawn;
	}
});
