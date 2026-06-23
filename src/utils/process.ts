/**
 * Bun.spawn / stdio helpers aligned with
 * https://bun.com/docs/runtime/child-process#spawn-a-process-bun-spawn
 * https://bun.com/docs/guides/process/spawn
 * https://bun.com/docs/runtime/child-process#terminal-pty-support
 */

/** Default PTY `name` (set `TERM` separately via spawn `env`). */
export const DEFAULT_TERM_NAME = 'xterm-256color';

/** Default `COLORTERM` for truecolor PTY children (Bun `terminal.name` does not set env). */
export const DEFAULT_COLORTERM = 'truecolor';

/**
 * Bun docs: `terminal.name` configures the PTY type only.
 * Child `process.env.TERM` must be set explicitly on `Bun.spawn({ env })`.
 */
export const TERM_ENV_NOTE =
	'terminal.name does not set TERM — spawnEnvWithTerm() merges TERM and COLORTERM into child env.';

export const BUN_SPAWN_GUIDE_URL = 'https://bun.com/docs/guides/process/spawn';
export const BUN_SPAWN_DOCS_URL =
	'https://bun.com/docs/runtime/child-process#spawn-a-process-bun-spawn';
export const BUN_SPAWN_STDOUT_DOCS_URL =
	'https://bun.com/docs/guides/process/spawn-stdout#read-stdout-from-a-child-process';
export const BUN_SPAWN_STDERR_DOCS_URL =
	'https://bun.com/docs/guides/process/spawn-stderr#read-stderr-from-a-child-process';

export function isSpawnAvailable(): boolean {
	return typeof Bun.spawn === 'function';
}
export const BUN_TERMINAL_DOCS_URL = 'https://bun.com/reference/bun/Terminal';

/**
 * Bun.spawn stdio defaults per child-process API.
 * @see {@link BUN_SPAWN_DOCS_URL}
 */
export const SPAWN_STDIO_DEFAULTS = {
	stdin: null,
	stdout: 'pipe' as const,
	stderr: 'inherit' as const,
};

/** Operator notes for `Bun.spawn` / `Bun.Subprocess` (non-PTY). */
export const SPAWN_BEHAVIOR = {
	stdinDefault: 'null — provide no input to the subprocess',
	stdoutDefault: 'pipe — ReadableStream on proc.stdout',
	stderrDefault: 'inherit — parent stderr',
	completion: 'await proc.exited',
	exitMetadata: 'proc.killed, proc.exitCode, proc.signalCode',
	kill: 'proc.kill(signal?)',
	detach: 'proc.unref() — parent may exit before child',
	resourceUsage: 'proc.resourceUsage() after proc.exited',
	timeout: 'options.timeout (ms); default killSignal SIGTERM',
	abort: 'options.signal (AbortSignal)',
} as const;

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

export type SpawnProc = ReturnType<typeof Bun.spawn>;

export type SpawnOnExitHandler = NonNullable<
	NonNullable<Parameters<typeof Bun.spawn>[1]>['onExit']
>;

export interface SpawnChildOptions extends SpawnInheritOptions {
	stdin?: SpawnWritable | null;
	stdout?: SpawnReadable;
	stderr?: SpawnReadable;
	onExit?: SpawnOnExitHandler;
}

export interface SpawnCapturedOptions extends SpawnChildOptions {}

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
 * @see {@link BUN_SPAWN_STDOUT_DOCS_URL}
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

function baseSpawnOptions(options: SpawnInheritOptions = {}): SpawnInheritOptions {
	return {
		cwd: options.cwd,
		env: spawnEnvWithTerm(options.env),
		signal: options.signal,
		timeout: options.timeout,
		killSignal: options.killSignal,
	};
}

/**
 * Spawn a child process (`Bun.spawn`) with Bun guide defaults.
 * Await completion via {@link spawnAndWait} or `await proc.exited`.
 * @see {@link BUN_SPAWN_GUIDE_URL}
 */
export function spawnChild(command: string[], options: SpawnChildOptions = {}): SpawnProc {
	return Bun.spawn(command, {
		...baseSpawnOptions(options),
		stdin: options.stdin ?? SPAWN_STDIO_DEFAULTS.stdin,
		stdout: options.stdout ?? SPAWN_STDIO_DEFAULTS.stdout,
		stderr: options.stderr ?? SPAWN_STDIO_DEFAULTS.stderr,
		onExit: options.onExit,
	});
}

/** Read `proc.killed` / `proc.exitCode` / `proc.signalCode` after spawn. */
export function getSpawnExitState(proc: SpawnProc): SpawnWaitResult {
	return {
		exitCode: proc.exitCode ?? 0,
		killed: proc.killed,
		signalCode: proc.signalCode,
	};
}

/** Kill a subprocess (`proc.kill(signal?)` per Bun.spawn API). */
export function killSpawn(proc: SpawnProc, signal?: number | NodeJS.Signals): void {
	proc.kill(signal);
}

/** Detach child from parent event loop (`proc.unref()`). */
export function unrefSpawn(proc: SpawnProc): void {
	proc.unref();
}

/** Spawn and await `proc.exited` (Bun spawn guide completion pattern). */
export async function spawnAndWait(
	command: string[],
	options: SpawnChildOptions = {},
): Promise<SpawnWaitResult & {proc: SpawnProc}> {
	const proc = spawnChild(command, options);
	const exitCode = await proc.exited;
	return {
		proc,
		exitCode,
		killed: proc.killed,
		signalCode: proc.signalCode,
	};
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

/** Read piped child stdout (equivalent to `await proc.stdout.text()`). */
export async function readSpawnStdout(proc: {
	stdout: number | ReadableStream<Uint8Array> | undefined | null;
}): Promise<string> {
	return readSpawnText(proc.stdout);
}

/** Read piped child stderr (equivalent to `await proc.stderr.text()`). */
export async function readSpawnStderr(proc: {
	stderr: number | ReadableStream<Uint8Array> | undefined | null;
}): Promise<string> {
	return readSpawnText(proc.stderr);
}

/**
 * Spawn with piped stdout (Bun default) and inherited stderr.
 * @see {@link BUN_SPAWN_STDOUT_DOCS_URL}
 */
export function spawnStdoutCaptured(
	command: string[],
	options: SpawnInheritOptions = {},
): SpawnProc {
	return spawnChild(command, {
		...options,
		stdin: null,
		stdout: SPAWN_STDIO_DEFAULTS.stdout,
		stderr: SPAWN_STDIO_DEFAULTS.stderr,
	});
}

/**
 * Spawn with piped stderr and inherited stdout.
 * @see {@link BUN_SPAWN_STDERR_DOCS_URL}
 */
export function spawnStderrCaptured(
	command: string[],
	options: SpawnInheritOptions = {},
): SpawnProc {
	return spawnChild(command, {
		...options,
		stdin: null,
		stdout: 'inherit',
		stderr: 'pipe',
	});
}

export interface SpawnStdoutTextResult extends SpawnWaitResult {
	stdout: string;
}

/**
 * Spawn, await exit, and read stdout text (`echo hello` guide pattern).
 * @see {@link BUN_SPAWN_GUIDE_URL}
 */
export async function spawnStdoutText(
	command: string[],
	options: SpawnChildOptions = {},
): Promise<SpawnStdoutTextResult> {
	const proc = spawnChild(command, options);
	const [exitCode, stdout] = await Promise.all([proc.exited, readSpawnStdout(proc)]);
	return {
		exitCode,
		stdout,
		killed: proc.killed,
		signalCode: proc.signalCode,
	};
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

export interface SpawnSyncCapturedOptions extends SpawnInheritOptions {
	stdin?: SpawnWritable | null;
	stdout?: SpawnReadable;
	stderr?: SpawnReadable;
	maxBuffer?: number;
}

export interface SpawnSyncCapturedResult {
	exitCode: number;
	signalCode: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
	success: boolean;
}

/**
 * Blocking spawn for CLI probes (`Bun.spawnSync` — stdout/stderr as Buffer).
 * @see {@link BUN_SPAWN_DOCS_URL}
 */
export function spawnSyncCaptured(
	command: string[],
	options: SpawnSyncCapturedOptions = {},
): SpawnSyncCapturedResult {
	const proc = Bun.spawnSync(command, {
		cwd: options.cwd,
		env: spawnEnvWithTerm(options.env),
		stdin: options.stdin ?? SPAWN_STDIO_DEFAULTS.stdin,
		stdout: options.stdout ?? 'pipe',
		stderr: options.stderr ?? 'pipe',
		signal: options.signal,
		timeout: options.timeout,
		killSignal: options.killSignal,
		maxBuffer: options.maxBuffer,
	});

	return {
		exitCode: proc.exitCode,
		signalCode: (proc.signalCode ?? null) as NodeJS.Signals | null,
		stdout: proc.stdout?.toString() ?? '',
		stderr: proc.stderr?.toString() ?? '',
		success: proc.success,
	};
}

/**
 * Spawn with piped stdout/stderr and optional Bun `timeout` / `AbortSignal`.
 * @see {@link BUN_SPAWN_DOCS_URL}
 */
export async function spawnCaptured(
	command: string[],
	options: SpawnCapturedOptions = {},
): Promise<SpawnCapturedResult> {
	const timeoutMs = options.timeout ?? DEFAULT_SPAWN_TIMEOUT_MS;
	const proc = spawnChild(command, {
		...options,
		stdin: options.stdin ?? null,
		stdout: options.stdout ?? 'pipe',
		stderr: options.stderr ?? 'pipe',
		timeout: timeoutMs,
	});

	const exitCode = await proc.exited;
	const timedOut = wasSpawnTimedOut(proc, timeoutMs, options.signal);
	let stdout = '';
	let stderr = '';
	if (timedOut) {
		stderr = `Timed out after ${timeoutMs}ms`;
	} else {
		[stdout, stderr] = await Promise.all([readSpawnStdout(proc), readSpawnStderr(proc)]);
	}

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
	spawnSyncAvailable: boolean;
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
	/** Default PTY name passed to Bun.spawn `terminal.name` (not the child TERM env). */
	ptyTermName: string;
	docsUrl: string;
	spawnGuideUrl: string;
	terminalDocsUrl: string;
}

/** Snapshot Bun process/spawn capabilities for doctor diagnostics. */
export function getProcessRuntimeInfo(): ProcessRuntimeInfo {
	const force = parseForceColor(process.env[FORCE_COLOR_ENV]);
	return {
		spawnAvailable: typeof Bun.spawn === 'function',
		spawnSyncAvailable: typeof Bun.spawnSync === 'function',
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
		ptyTermName: DEFAULT_TERM_NAME,
		docsUrl: BUN_SPAWN_DOCS_URL,
		spawnGuideUrl: BUN_SPAWN_GUIDE_URL,
		terminalDocsUrl: BUN_TERMINAL_DOCS_URL,
	};
}

/** Bun.spawn stdio defaults table (child-process API). */
export function formatSpawnBehaviorTable(): string {
	return Bun.inspect.table(
		[
			{
				stream: 'stdin',
				default: String(SPAWN_STDIO_DEFAULTS.stdin),
				api: SPAWN_BEHAVIOR.stdinDefault,
			},
			{
				stream: 'stdout',
				default: SPAWN_STDIO_DEFAULTS.stdout,
				api: SPAWN_BEHAVIOR.stdoutDefault,
			},
			{
				stream: 'stderr',
				default: SPAWN_STDIO_DEFAULTS.stderr,
				api: SPAWN_BEHAVIOR.stderrDefault,
			},
			{stream: 'exit', default: 'proc.exited', api: SPAWN_BEHAVIOR.completion},
			{stream: 'kill', default: 'proc.kill()', api: SPAWN_BEHAVIOR.kill},
		],
		['stream', 'default', 'api'],
		{colors: shouldColorize(process.stderr)},
	);
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
				signal: 'Bun.spawnSync',
				value: info.spawnSyncAvailable ? 'yes' : 'no',
				api: 'Bun.spawnSync',
			},
			{
				signal: 'spawn stdin',
				value: String(SPAWN_STDIO_DEFAULTS.stdin),
				api: 'Bun.spawn stdin default',
			},
			{
				signal: 'spawn stdout',
				value: SPAWN_STDIO_DEFAULTS.stdout,
				api: 'Bun.spawn stdout default',
			},
			{
				signal: 'spawn stderr',
				value: SPAWN_STDIO_DEFAULTS.stderr,
				api: 'Bun.spawn stderr default',
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
			{
				signal: 'terminal.name',
				value: info.ptyTermName,
				api: 'Bun.spawn terminal.name (not TERM env)',
			},
			{
				signal: 'TERM env note',
				value: TERM_ENV_NOTE,
				api: 'spawnEnvWithTerm',
			},
		],
		['signal', 'value', 'api'],
		{colors: shouldColorize(process.stderr)},
	);
}
