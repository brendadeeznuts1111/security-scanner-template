import {DEFAULT_SPAWN_TIMEOUT_MS, spawnCaptured, spawnEnvWithTerm} from '../utils/process.ts';
import {attachPty, spawnPtyProcess, withPtySession, writeTerminalOutput} from './terminal.ts';
import {
	DEFAULT_SECURITY_TOOLS,
	detectTool,
	detectTools,
	type SecurityToolName,
	type ToolDetection,
} from '../utils/tool-detector.ts';

export {DEFAULT_SECURITY_TOOLS, detectTool, detectTools, type SecurityToolName, type ToolDetection};
export {
	attachPty,
	BUN_PTY_DOCS_URL,
	createSpawnTerminalOptions,
	createReusableTerminal,
	disposeReusableTerminal,
	ptyDimensions,
	PTY_SPAWN_BEHAVIOR,
	spawnPtyProcess,
	terminalOutputMode,
	withPtySession,
	writeTerminalOutput,
	type CreateSpawnTerminalConfig,
	type PtyAttachOptions,
	type PtyDimensions,
	type PtySpawnOptions,
	type PtySpawnResult,
	type ReusableTerminalOptions,
	type SpawnTerminalOptions,
} from './terminal.ts';

export const DEFAULT_TOOL_TIMEOUT_MS = DEFAULT_SPAWN_TIMEOUT_MS;

export interface ToolRunResult {
	name: string;
	command: string;
	args: string[];
	exitCode: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
	killed: boolean;
	signalCode: NodeJS.Signals | null;
}

export interface ToolRunOptions {
	args?: string[];
	cwd?: string;
	env?: Record<string, string>;
	timeoutMs?: number;
	signal?: AbortSignal;
	killSignal?: string | number;
}

export interface PtyRunOptions {
	args?: string[];
	cwd?: string;
	env?: Record<string, string>;
	cols?: number;
	rows?: number;
	/** Forward stdin to the child PTY (default: true when stdin is a TTY). */
	stdin?: boolean;
}

export interface PtyRunResult {
	name: string;
	command: string;
	args: string[];
	exitCode: number;
}

/**
 * Run an external security tool with Bun.spawn.
 * Awaits `proc.exited` and captures stdout/stderr via {@link spawnCaptured}.
 * @see https://bun.sh/docs/guides/process/spawn
 */
export async function runTool(
	command: string,
	options: ToolRunOptions = {},
): Promise<ToolRunResult> {
	const executable = detectTool(command);
	if (!executable) {
		return {
			name: command,
			command,
			args: options.args ?? [],
			exitCode: null,
			stdout: '',
			stderr: `Tool not found: ${command}`,
			timedOut: false,
			killed: false,
			signalCode: null,
		};
	}

	const args = options.args ?? ['--version'];
	const timeoutMs = options.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;

	const captured = await spawnCaptured([executable, ...args], {
		cwd: options.cwd,
		env: options.env,
		timeout: timeoutMs,
		killSignal: options.killSignal,
		signal: options.signal,
	});

	return {
		name: command,
		command: executable,
		args,
		exitCode: captured.exitCode,
		stdout: captured.stdout,
		stderr: captured.stderr,
		timedOut: captured.timedOut,
		killed: captured.killed,
		signalCode: captured.signalCode,
	};
}

/**
 * Orchestrate external scanners with optional PTY support.
 */
export class ToolRunner {
	/**
	 * Run a tool with a Bun.Terminal PTY for colored output and progress bars.
	 */
	async runWithPTY(command: string, options: PtyRunOptions = {}): Promise<PtyRunResult> {
		const executable = detectTool(command);
		if (!executable) {
			throw new Error(`Tool not found: ${command}`);
		}

		const args = options.args ?? [];
		const spawned = await spawnPtyProcess([executable, ...args], {
			cwd: options.cwd,
			env: options.env,
			cols: options.cols,
			rows: options.rows,
			stdin: options.stdin,
			onData: writeTerminalOutput,
		});

		return {
			name: command,
			command: executable,
			args,
			exitCode: spawned.exitCode,
		};
	}

	/**
	 * Interactive scanner run — PTY with stdin forwarding enabled.
	 */
	async runInteractive(command: string, options: PtyRunOptions = {}): Promise<PtyRunResult> {
		return this.runWithPTY(command, {...options, stdin: options.stdin ?? true});
	}

	/**
	 * Run a tool attached to an existing Bun.Terminal (shared REPL session).
	 */
	async runOnTerminal(
		command: string,
		terminal: Bun.Terminal,
		options: PtyRunOptions = {},
	): Promise<PtyRunResult> {
		const executable = detectTool(command);
		if (!executable) {
			throw new Error(`Tool not found: ${command}`);
		}

		const args = options.args ?? [];
		const proc = Bun.spawn({
			cmd: [executable, ...args],
			cwd: options.cwd,
			env: spawnEnvWithTerm(options.env),
			terminal,
		});

		const exitCode = await withPtySession(
			terminal,
			{stdin: options.stdin ?? true},
			async () => proc.exited,
		);

		return {
			name: command,
			command: executable,
			args,
			exitCode,
		};
	}
}

/**
 * Run a tool interactively via PTY (convenience wrapper).
 */
export async function runInteractiveTool(
	command: string,
	options: PtyRunOptions = {},
): Promise<PtyRunResult> {
	return new ToolRunner().runInteractive(command, options);
}

/**
 * Run all available tools from a detection list.
 */
export async function runAvailableTools(
	names: readonly string[] = DEFAULT_SECURITY_TOOLS,
	options: ToolRunOptions = {},
): Promise<ToolRunResult[]> {
	const available = detectTools(names).filter(tool => tool.available);
	return Promise.all(available.map(tool => runTool(tool.name, options)));
}
