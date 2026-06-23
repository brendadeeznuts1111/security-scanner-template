/**
 * Bun.spawn / stdio helpers aligned with
 * https://bun.sh/docs/runtime/child-process#terminal-pty-support
 */

/** Default PTY `name` (set `TERM` separately via spawn `env`). */
export const DEFAULT_TERM_NAME = 'xterm-256color';

/** Default `COLORTERM` for truecolor PTY children (Bun `terminal.name` does not set env). */
export const DEFAULT_COLORTERM = 'truecolor';

export const BUN_SPAWN_DOCS_URL = 'https://bun.com/docs/runtime/child-process';
export const BUN_TERMINAL_DOCS_URL = 'https://bun.com/reference/bun/Terminal';

export const INTERACTIVE_FORCE_ENV = 'SP_FORCE_SHELL';
export const FORCE_COLOR_ENV = 'FORCE_COLOR';
export const NO_COLOR_ENV = 'NO_COLOR';

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

function parseForceColor(value: string | undefined): boolean | undefined {
	if (value === undefined || value === '') {
		return undefined;
	}
	if (value === '0' || value === 'false') {
		return false;
	}
	return true;
}

/** True when ANSI/color output is appropriate (TTY, `FORCE_COLOR`, or `NO_COLOR`). */
export function shouldColorize(stream: NodeJS.WriteStream = process.stderr): boolean {
	const force = parseForceColor(process.env[FORCE_COLOR_ENV]);
	if (force === false || process.env[NO_COLOR_ENV] !== undefined) {
		return false;
	}
	if (force === true) {
		return true;
	}
	return Boolean(stream.isTTY);
}

/**
 * Stream for human-oriented parent output: stdout on TTY, stderr when stdout is piped.
 * Keeps JSON on stdout pipe-safe (`bun sp doctor --json | fx`).
 */
export function resolveHumanStdout(): NodeJS.WriteStream {
	return process.stdout.isTTY ? process.stdout : process.stderr;
}

/**
 * Resolve stdout mode for Bun.spawn children: inherit on TTY, pipe in CI/pipelines.
 * @see Bun.spawn stdout option
 */
export function resolveSpawnStdout(): SpawnReadable {
	return process.stdout.isTTY ? 'inherit' : 'pipe';
}

/**
 * Merge process env with PTY-friendly `TERM` + `COLORTERM` for Bun.spawn `terminal` children.
 * Bun's `terminal.name` does not set `TERM`; set both explicitly in `env`.
 */
export function spawnEnvWithTerm(
	extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
	return {
		...process.env,
		TERM: process.env.TERM ?? DEFAULT_TERM_NAME,
		COLORTERM: process.env.COLORTERM ?? DEFAULT_COLORTERM,
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
export function requireInteractiveSession(context: string, forceEnv = INTERACTIVE_FORCE_ENV): void {
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
	const stderr = timedOut ? `Timed out after ${timeoutMs}ms` : await readSpawnText(proc.stderr);

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

export interface ProcessRuntimeInfo {
	spawnAvailable: boolean;
	terminalAvailable: boolean;
	interactiveSession: boolean;
	platform: NodeJS.Platform;
	bunVersion: string;
	bunRevision: string;
	stdinIsTTY: boolean;
	stdoutIsTTY: boolean;
	stderrIsTTY: boolean;
	colorize: boolean;
	forceColor: boolean;
	noColor: boolean;
	term: string | undefined;
	colorterm: string | undefined;
	docsUrl: string;
}

/** Snapshot Bun process/spawn capabilities for doctor diagnostics. */
export function getProcessRuntimeInfo(): ProcessRuntimeInfo {
	const force = parseForceColor(process.env[FORCE_COLOR_ENV]);
	return {
		spawnAvailable: typeof Bun.spawn === 'function',
		terminalAvailable: typeof Bun.Terminal === 'function',
		interactiveSession: isInteractiveSession(),
		platform: process.platform,
		bunVersion: Bun.version,
		bunRevision: Bun.revision,
		stdinIsTTY: Boolean(process.stdin.isTTY),
		stdoutIsTTY: Boolean(process.stdout.isTTY),
		stderrIsTTY: Boolean(process.stderr.isTTY),
		colorize: shouldColorize(process.stderr),
		forceColor: force === true,
		noColor: process.env[NO_COLOR_ENV] !== undefined,
		term: process.env.TERM,
		colorterm: process.env.COLORTERM,
		docsUrl: BUN_SPAWN_DOCS_URL,
	};
}

/** Terminal table of process runtime detection (Bun.inspect.table). */
export function formatRuntimeInfoTable(info: ProcessRuntimeInfo = getProcessRuntimeInfo()): string {
	return Bun.inspect.table(
		[
			{
				signal: 'stdin TTY',
				value: info.stdinIsTTY ? 'yes' : 'no',
				api: 'process.stdin.isTTY',
			},
			{
				signal: 'stdout TTY',
				value: info.stdoutIsTTY ? 'yes' : 'no',
				api: 'process.stdout.isTTY',
			},
			{
				signal: 'stderr TTY',
				value: info.stderrIsTTY ? 'yes' : 'no',
				api: 'process.stderr.isTTY',
			},
			{
				signal: 'interactive',
				value: info.interactiveSession ? 'yes' : 'no',
				api: 'stdin+stdout TTY',
			},
			{
				signal: 'colorize',
				value: info.colorize ? 'yes' : 'no',
				api: `${FORCE_COLOR_ENV} / ${NO_COLOR_ENV}`,
			},
			{
				signal: 'Bun.spawn',
				value: info.spawnAvailable ? 'yes' : 'no',
				api: 'Bun.spawn',
			},
			{
				signal: 'Bun.Terminal',
				value: info.terminalAvailable ? 'yes' : 'no',
				api: 'Bun.Terminal',
			},
			{
				signal: 'platform',
				value: info.platform,
				api: 'process.platform',
			},
			{
				signal: 'bun',
				value: `${info.bunVersion} (${info.bunRevision.slice(0, 8)})`,
				api: 'process.versions.bun / Bun.revision',
			},
			{
				signal: 'TERM',
				value: info.term ?? '(unset)',
				api: 'spawnEnvWithTerm',
			},
			{
				signal: 'COLORTERM',
				value: info.colorterm ?? '(unset)',
				api: 'spawnEnvWithTerm',
			},
		],
		['signal', 'value', 'api'],
		{colors: shouldColorize(process.stderr)},
	);
}
