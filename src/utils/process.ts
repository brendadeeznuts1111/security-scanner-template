/**
 * Bun.spawn / stdio helpers aligned with
 * https://bun.com/docs/runtime/child-process
 */

/** Default PTY `name` (set `TERM` separately via spawn `env`). */
export const DEFAULT_TERM_NAME = 'xterm-256color';

export const BUN_SPAWN_DOCS_URL = 'https://bun.com/docs/runtime/child-process';
export const BUN_TERMINAL_DOCS_URL = 'https://bun.com/reference/bun/Terminal';

export const INTERACTIVE_FORCE_ENV = 'SP_FORCE_SHELL';

export type SpawnReadable = 'pipe' | 'inherit' | 'ignore';
export type SpawnWritable = 'pipe' | 'inherit' | 'ignore';

export interface SpawnInheritOptions {
	cwd?: string;
	env?: Record<string, string | undefined>;
	signal?: AbortSignal;
	timeout?: number;
	killSignal?: string | number;
}

export interface SpawnWaitResult {
	exitCode: number;
	killed: boolean;
	signalCode: NodeJS.Signals | null;
}

export interface SpawnCapturedOptions extends SpawnInheritOptions {
	stdin?: SpawnWritable | null;
	stdout?: SpawnReadable;
	stderr?: SpawnReadable;
}

export interface SpawnCapturedResult extends SpawnWaitResult {
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

/** Default timeout for captured spawns (external tool probes). */
export const DEFAULT_SPAWN_TIMEOUT_MS = 30_000;

/** True when both stdin and stdout are TTYs (interactive operator session). */
export function isInteractiveSession(): boolean {
	return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/** True when ANSI/color output is appropriate for the given stream (default: stderr). */
export function shouldColorize(stream: NodeJS.WriteStream = process.stderr): boolean {
	return Boolean(stream.isTTY);
}

/**
 * Resolve stdout for human-oriented child output: inherit on TTY, pipe in CI/pipelines.
 * @see Bun.spawn stdout option
 */
export function resolveHumanStdout(): SpawnReadable {
	return process.stdout.isTTY ? 'inherit' : 'pipe';
}

/**
 * Merge process env with a PTY-friendly `TERM` for Bun.spawn `terminal` children.
 * The `terminal.name` option does not set `TERM`; set it explicitly in `env`.
 */
export function spawnEnvWithTerm(
	extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
	return {
		...process.env,
		TERM: process.env.TERM ?? DEFAULT_TERM_NAME,
		...extra,
	};
}

/** True when tests or operators bypass the interactive TTY requirement. */
export function isInteractiveForced(forceEnv = INTERACTIVE_FORCE_ENV): boolean {
	return Boolean(process.env[forceEnv]);
}

/**
 * Assert an interactive session (stdin + stdout TTY) or a documented force override.
 * @throws when the session cannot host PTY / REPL workflows
 */
export function requireInteractiveSession(
	context: string,
	forceEnv = INTERACTIVE_FORCE_ENV,
): void {
	if (isInteractiveSession() || isInteractiveForced(forceEnv)) {
		return;
	}
	throw new Error(
		`${context} requires an interactive terminal (stdin and stdout must be TTYs). ` +
			`For piped output use JSON flags (e.g. bun sp doctor --json | fx). ` +
			`Set ${forceEnv}=1 to override in tests.`,
	);
}

/** Log a fatal message and exit when interactive mode is unavailable. */
export function exitIfNotInteractive(context: string, forceEnv = INTERACTIVE_FORCE_ENV): void {
	try {
		requireInteractiveSession(context, forceEnv);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(message);
		process.exit(1);
	}
}

/**
 * Spawn a child with inherited stdio (operator-facing CLIs).
 * Bun keeps TTY state when this process owns the terminal; piped producers
 * do not clobber downstream pagers on Bun >= 1.3.14.
 */
export async function spawnInherit(
	command: string[],
	options: SpawnInheritOptions = {},
): Promise<SpawnWaitResult> {
	const proc = Bun.spawn(command, {
		cwd: options.cwd,
		env: spawnEnvWithTerm(options.env),
		stdin: 'inherit',
		stdout: 'inherit',
		stderr: 'inherit',
		signal: options.signal,
		timeout: options.timeout,
		killSignal: options.killSignal,
	});

	const exitCode = await proc.exited;
	return {
		exitCode,
		killed: proc.killed,
		signalCode: proc.signalCode,
	};
}

/** Read piped subprocess output; returns empty string for inherited/file descriptors. */
export async function readSpawnText(
	stream: number | ReadableStream<Uint8Array> | undefined | null,
): Promise<string> {
	if (stream == null || typeof stream === 'number') {
		return '';
	}
	return new Response(stream).text();
}

function wasSpawnTimedOut(
	proc: {killed: boolean; signalCode: NodeJS.Signals | null},
	timeoutMs: number | undefined,
	signal?: AbortSignal,
): boolean {
	if (!timeoutMs || timeoutMs <= 0 || signal?.aborted) {
		return false;
	}
	return proc.killed && proc.signalCode === 'SIGTERM';
}

/**
 * Machine-readable CLI output on stdout (safe to pipe to jq/fx/less).
 * Keep human progress on stderr via {@link writeHumanStderr}.
 */
export function writeJsonStdout(value: unknown, indent = 2): void {
	console.log(JSON.stringify(value, null, indent));
}

/** Human-oriented CLI progress and tables (stderr — stdout may be piped). */
export function writeHumanStderr(message: string): void {
	console.error(message);
}

/**
 * Spawn with piped stdout/stderr and optional Bun `timeout` / `AbortSignal`.
 * @see https://bun.com/docs/runtime/child-process#using-timeout-and-killsignal
 */
export async function spawnCaptured(
	command: string[],
	options: SpawnCapturedOptions = {},
): Promise<SpawnCapturedResult> {
	const timeoutMs = options.timeout ?? DEFAULT_SPAWN_TIMEOUT_MS;
	const proc = Bun.spawn(command, {
		cwd: options.cwd,
		env: spawnEnvWithTerm(options.env),
		stdin: options.stdin ?? null,
		stdout: options.stdout ?? 'pipe',
		stderr: options.stderr ?? 'pipe',
		signal: options.signal,
		timeout: timeoutMs,
		killSignal: options.killSignal,
	});

	const exitCode = await proc.exited;
	const timedOut = wasSpawnTimedOut(proc, timeoutMs, options.signal);
	const stdout = timedOut ? '' : await readSpawnText(proc.stdout);
	const stderr = timedOut
		? `Timed out after ${timeoutMs}ms`
		: await readSpawnText(proc.stderr);

	return {
		exitCode,
		stdout,
		stderr,
		timedOut,
		killed: proc.killed,
		signalCode: proc.signalCode,
	};
}

/** Spawn with inherited stdio and replace the current process exit code. */
export async function spawnInheritAndExit(
	command: string[],
	options: SpawnInheritOptions = {},
): Promise<never> {
	const result = await spawnInherit(command, options);
	process.exit(result.exitCode);
}

/** Snapshot Bun process/spawn capabilities for doctor diagnostics. */
export function getProcessRuntimeInfo(): {
	spawnAvailable: boolean;
	terminalAvailable: boolean;
	interactiveSession: boolean;
	platform: NodeJS.Platform;
	docsUrl: string;
} {
	return {
		spawnAvailable: typeof Bun.spawn === 'function',
		terminalAvailable: typeof Bun.Terminal === 'function',
		interactiveSession: isInteractiveSession(),
		platform: process.platform,
		docsUrl: BUN_SPAWN_DOCS_URL,
	};
}