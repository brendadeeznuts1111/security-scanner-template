import {DEFAULT_TERM_NAME, spawnEnvWithTerm} from '../utils/process.ts';
import {isPagerFriendlyPipeline, WINDOWS_CONPTY_NOTES} from '../utils/terminal-io.ts';

/** Official Bun PTY spawn documentation. */
export const BUN_PTY_DOCS_URL = 'https://bun.com/docs/runtime/child-process#terminal-pty-support';

/** Official Bun `TerminalOptions` shape (PTY on POSIX, ConPTY on Windows). */
export type BunTerminalOptions = Bun.TerminalOptions;

/** `Bun.spawn({ terminal })` accepts a reusable instance or inline options. */
export type SpawnTerminalInput = Bun.Terminal | BunTerminalOptions;

/**
 * PTY behaviour notes from Bun docs (POSIX openpty vs Windows ConPTY).
 *
 * When `terminal` is set on `Bun.spawn`:
 * - Child sees `process.stdout.isTTY === true`
 * - `proc.stdin` / `proc.stdout` / `proc.stderr` are `null` — use `proc.terminal`
 * - `terminal.exit` fires when the PTY stream closes (not subprocess exit)
 * - Use `proc.exited` for subprocess exit codes
 * - `terminal.name` configures the PTY type; set `TERM` via `env` separately
 */
export const PTY_SPAWN_BEHAVIOR = {
	stdioConnectedToTerminal: true,
	subprocessStreamsNull: true,
	processExit: 'proc.exited',
	ptyLifecycleExit: 'terminal.exit (PTY EOF) or terminal.close()',
	reusableTerminal: 'reuse Bun.Terminal across spawns; close when session ends',
	termEnvSeparateFromName: 'terminal.name does not set TERM — use spawnEnvWithTerm()',
	windows: WINDOWS_CONPTY_NOTES.summary,
} as const;

export interface PtyDimensions {
	cols: number;
	rows: number;
}

export interface PtyAttachOptions {
	/** Forward process.stdin to the PTY (default: true when stdin is a TTY). */
	stdin?: boolean;
	/** Forward PTY output to process.stdout (default: true). */
	stdout?: boolean;
	/** Initial terminal size. */
	cols?: number;
	rows?: number;
}

export interface PtySession {
	exitCode: Promise<number>;
	close(): void;
}

/** Minimal PTY surface for tests and attach helpers. */
export interface PtyTerminal {
	write(data: string | Uint8Array | ArrayBuffer): void;
	resize(cols: number, rows: number): void;
	close(): void;
	setRawMode?(enabled: boolean): void;
	ref?(): void;
	unref?(): void;
}

export interface CreateSpawnTerminalConfig {
	onData?: (data: Uint8Array) => void;
	dimensions?: PtyDimensions;
	/** PTY stream lifecycle — not the subprocess exit code. */
	onExit?: (term: Bun.Terminal, exitCode: number, signal: string | null) => void;
	onDrain?: (term: Bun.Terminal) => void;
	name?: string;
}

export interface PtySpawnOptions {
	cwd?: string;
	env?: Record<string, string | undefined>;
	cols?: number;
	rows?: number;
	/** Forward parent stdin to the PTY (default: true when stdin is a TTY). */
	stdin?: boolean;
	signal?: AbortSignal;
	onData?: (data: Uint8Array) => void;
	onTerminalExit?: (term: Bun.Terminal, exitCode: number, signal: string | null) => void;
	onDrain?: (term: Bun.Terminal) => void;
	/** Reuse a `Bun.Terminal` or pass inline `TerminalOptions` (do not set stdio). */
	terminal?: SpawnTerminalInput;
}

export interface PtySpawnResult {
	exitCode: number;
	pid: number;
	killed: boolean;
	signalCode: NodeJS.Signals | null;
}

/** @deprecated Use {@link BunTerminalOptions} — alias kept for exports. */
export type SpawnTerminalOptions = BunTerminalOptions;

function defaultCols(): number {
	return process.stdout.columns ?? 80;
}

function defaultRows(): number {
	return process.stdout.rows ?? 24;
}

export function isBunTerminal(value: unknown): value is Bun.Terminal {
	return typeof Bun.Terminal === 'function' && value instanceof Bun.Terminal;
}

export function isTerminalOptions(value: unknown): value is BunTerminalOptions {
	return (
		typeof value === 'object' &&
		value !== null &&
		!isBunTerminal(value) &&
		('cols' in value || 'rows' in value || 'name' in value || 'data' in value)
	);
}

/**
 * Write PTY bytes to stdout (works for TTY and piped consumers).
 *
 * When stdout is a pipe, Bun >= 1.3.14 leaves downstream pager termios alone
 * at exit so tools like less/fzf/fx keep raw mode.
 */
export function writeTerminalOutput(data: Uint8Array | string): void {
	process.stdout.write(data);
}

/**
 * Create a standalone `Bun.Terminal` with official defaults.
 *
 * Supports `await using term = createTerminal({...})` when `AsyncDisposable` is available.
 */
export function createTerminal(
	options: Partial<BunTerminalOptions> & CreateSpawnTerminalConfig = {},
): Bun.Terminal {
	const size = ptyDimensions({
		cols: options.cols ?? options.dimensions?.cols,
		rows: options.rows ?? options.dimensions?.rows,
	});
	const onData = options.onData ?? writeTerminalOutput;

	return new Bun.Terminal({
		cols: size.cols,
		rows: size.rows,
		name: options.name ?? DEFAULT_TERM_NAME,
		data(term, data) {
			if (options.data) {
				options.data(term, data);
			} else {
				onData(data);
			}
		},
		exit: options.onExit ?? options.exit,
		drain: options.onDrain ?? options.drain,
	});
}

/**
 * Factory for Bun.spawn `terminal` option per Bun PTY docs.
 * @see {@link BUN_PTY_DOCS_URL}
 */
export function createSpawnTerminalOptions(
	onDataOrConfig: ((data: Uint8Array) => void) | CreateSpawnTerminalConfig,
	dimensions: PtyDimensions = ptyDimensions(),
): BunTerminalOptions {
	const config: CreateSpawnTerminalConfig =
		typeof onDataOrConfig === 'function' ? {onData: onDataOrConfig} : onDataOrConfig;
	const size = config.dimensions ?? dimensions;
	const onData = config.onData ?? writeTerminalOutput;

	const options: BunTerminalOptions = {
		cols: size.cols,
		rows: size.rows,
		name: config.name ?? DEFAULT_TERM_NAME,
		data(_term, data) {
			onData(data);
		},
	};

	if (config.onExit) {
		options.exit = config.onExit;
	}
	if (config.onDrain) {
		options.drain = config.onDrain;
	}

	return options;
}

/**
 * Normalize spawn input to `Bun.Terminal` or `TerminalOptions`.
 * Never combine `terminal` with explicit stdio on the same spawn.
 */
export function resolveSpawnTerminal(
	input: SpawnTerminalInput | CreateSpawnTerminalConfig | ((data: Uint8Array) => void),
	dimensions: PtyDimensions = ptyDimensions(),
): SpawnTerminalInput {
	if (isBunTerminal(input)) {
		return input;
	}
	if (
		typeof input === 'function' ||
		('onData' in (input as object) && !('write' in (input as object)))
	) {
		return createSpawnTerminalOptions(
			input as CreateSpawnTerminalConfig | ((data: Uint8Array) => void),
			dimensions,
		);
	}
	return input as BunTerminalOptions;
}

/**
 * Spawn a subprocess with a PTY attached (Bun docs canonical pattern).
 *
 * Parent stdin forwarding and resize propagation are handled by {@link withPtySession}.
 * Always uses {@link spawnEnvWithTerm} so `TERM`/`COLORTERM` are set (`terminal.name` does not).
 */
export async function spawnPtyProcess(
	cmd: string[],
	options: PtySpawnOptions = {},
): Promise<PtySpawnResult> {
	const size = ptyDimensions({cols: options.cols, rows: options.rows});
	const reusableTerminal = options.terminal && isBunTerminal(options.terminal);
	const terminalOption = options.terminal
		? resolveSpawnTerminal(options.terminal, size)
		: createSpawnTerminalOptions(
				{
					onData: options.onData,
					dimensions: size,
					onExit: options.onTerminalExit,
					onDrain: options.onDrain,
				},
				size,
			);

	const proc = Bun.spawn({
		cmd,
		cwd: options.cwd,
		env: spawnEnvWithTerm(options.env),
		signal: options.signal,
		terminal: terminalOption,
	});

	const terminal = proc.terminal;
	if (!terminal) {
		throw new Error('PTY terminal was not created by Bun.spawn');
	}

	const exitCode = await withPtySession(terminal, {stdin: options.stdin}, async () => proc.exited);

	if (!reusableTerminal) {
		terminal.close();
	}

	return {
		exitCode,
		pid: proc.pid,
		killed: proc.killed,
		signalCode: proc.signalCode,
	};
}

/**
 * Attach stdin forwarding and resize propagation to a Bun.spawn PTY terminal.
 *
 * Prefers `terminal.setRawMode()` when available (Bun.Terminal API). Falls back
 * to `process.stdin.setRawMode()` for test doubles. Resize listeners attach only
 * when stdout is a TTY (`process.stdout.on('resize')`).
 */
export function attachPty(
	terminal: PtyTerminal | Bun.Terminal,
	options: PtyAttachOptions = {},
): () => void {
	const cleanup: Array<() => void> = [];
	const forwardStdin = options.stdin ?? Boolean(process.stdin.isTTY);

	if (forwardStdin) {
		if (typeof terminal.setRawMode === 'function') {
			terminal.setRawMode(true);
			cleanup.push(() => terminal.setRawMode?.(false));
		} else if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
			process.stdin.setRawMode(true);
			cleanup.push(() => process.stdin.setRawMode?.(false));
		}

		if (process.stdin.isTTY) {
			void (async () => {
				try {
					for await (const chunk of process.stdin) {
						terminal.write(chunk);
					}
				} catch {
					// stdin closed
				}
			})();
		}
	}

	if (process.stdout.isTTY) {
		const onResize = () => {
			terminal.resize(defaultCols(), defaultRows());
		};
		process.stdout.on('resize', onResize);
		cleanup.push(() => process.stdout.off('resize', onResize));
	}

	return () => {
		for (const fn of cleanup) {
			fn();
		}
	};
}

/**
 * Run async work with PTY stdin/resize attached; always detaches in `finally`.
 */
export async function withPtySession<T>(
	terminal: PtyTerminal | Bun.Terminal,
	options: PtyAttachOptions,
	run: () => Promise<T>,
): Promise<T> {
	const detach = attachPty(terminal, options);
	try {
		return await run();
	} finally {
		detach();
	}
}

/** Default PTY dimensions for Bun.spawn `terminal` options. */
export function ptyDimensions(options: Partial<PtyDimensions> = {}): PtyDimensions {
	return {
		cols: options.cols ?? defaultCols(),
		rows: options.rows ?? defaultRows(),
	};
}

/** Hint for operators piping scanner output through pagers. */
export function terminalOutputMode(): 'tty' | 'pipe-pager-safe' | 'pipe-legacy' {
	if (process.stdout.isTTY) {
		return 'tty';
	}
	return isPagerFriendlyPipeline() ? 'pipe-pager-safe' : 'pipe-legacy';
}

export interface ReusableTerminalOptions {
	cols?: number;
	rows?: number;
	name?: string;
	/** Keep the event loop alive while the terminal is open (default: true). */
	keepAlive?: boolean;
	onData?: (data: Uint8Array) => void;
	/** Fires when `terminal.close()` ends the PTY stream (not per subprocess exit). */
	onExit?: (term: Bun.Terminal, exitCode: number, signal: string | null) => void;
	onDrain?: (term: Bun.Terminal) => void;
}

/**
 * Multi-spawn Bun.Terminal with `ref()` / `unref()` lifecycle.
 *
 * Prefer `await using terminal = createReusableTerminal()` / `createTerminal()`.
 *
 * @see {@link BUN_PTY_DOCS_URL} (Reusable Terminal)
 */
export function createReusableTerminal(options: ReusableTerminalOptions = {}): Bun.Terminal {
	const terminal = createTerminal({
		cols: options.cols,
		rows: options.rows,
		name: options.name,
		onData: options.onData,
		onExit: options.onExit,
		onDrain: options.onDrain,
	});

	if (options.keepAlive !== false) {
		terminal.ref();
	}

	return terminal;
}

export interface PtyAttachedProcess {
	exitCode: number | null;
	exited: Promise<number>;
	kill?: (exitCode?: number | NodeJS.Signals) => void;
}

/**
 * Dispose helper for reusable terminals (`await using` fallback).
 *
 * Kill attached children before closing on Windows — see Bun ConPTY platform notes.
 */
export async function disposeReusableTerminal(
	terminal: Bun.Terminal,
	proc?: PtyAttachedProcess,
): Promise<void> {
	if (proc && proc.exitCode === null && typeof proc.kill === 'function') {
		proc.kill();
		await proc.exited.catch(() => 0);
	}
	terminal.unref();
	terminal.close();
}
