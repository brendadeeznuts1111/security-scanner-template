import {expect, test} from 'bun:test';
import {
	BUN_SPAWN_DOCS_URL,
	DEFAULT_TERM_NAME,
	INTERACTIVE_FORCE_ENV,
	exitIfNotInteractive,
	getProcessRuntimeInfo,
	isInteractiveForced,
	isInteractiveSession,
	requireInteractiveSession,
	resolveHumanStdout,
	spawnEnvWithTerm,
	spawnCaptured,
	spawnInherit,
	writeJsonStdout,
} from '../../src/utils/process.ts';

test('getProcessRuntimeInfo reports Bun spawn and terminal APIs', () => {
	const info = getProcessRuntimeInfo();
	expect(info.spawnAvailable).toBe(typeof Bun.spawn === 'function');
	expect(info.terminalAvailable).toBe(typeof Bun.Terminal === 'function');
	expect(info.platform).toBe(process.platform);
	expect(info.docsUrl).toBe(BUN_SPAWN_DOCS_URL);
	expect(info.interactiveSession).toBe(isInteractiveSession());
});

test('spawnEnvWithTerm sets TERM when missing', () => {
	const original = process.env.TERM;
	try {
		delete process.env.TERM;
		const env = spawnEnvWithTerm({FOO: 'bar'});
		expect(env.TERM).toBe(DEFAULT_TERM_NAME);
		expect(env.FOO).toBe('bar');
	} finally {
		if (original === undefined) {
			delete process.env.TERM;
		} else {
			process.env.TERM = original;
		}
	}
});

test('resolveHumanStdout matches stdout TTY state', () => {
	expect(resolveHumanStdout()).toBe(process.stdout.isTTY ? 'inherit' : 'pipe');
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
	} finally {
		(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = originalSpawn;
	}
});