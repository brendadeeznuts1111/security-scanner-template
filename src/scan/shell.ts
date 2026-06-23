import {
	isInteractiveForced,
	isInteractiveSession,
	requireInteractiveSession,
	spawnEnvWithTerm,
} from '../utils/process.ts';
import {
	createReusableTerminal,
	disposeReusableTerminal,
	ptyDimensions,
	withPtySession,
	writeTerminalOutput,
} from './terminal.ts';

export interface InteractiveShellOptions {
	shell?: string;
	args?: string[];
	cwd?: string;
	env?: Record<string, string>;
	cols?: number;
	rows?: number;
}

/**
 * Whether an interactive PTY shell can run (stdin + stdout TTY, or test override).
 */
export function canRunInteractive(): boolean {
	return isInteractiveSession() || isInteractiveForced();
}

/**
 * Interactive subprocess with a reusable Bun.Terminal PTY.
 *
 * Supports `ref()` / `unref()` lifecycle, programmatic `write()` / `resize()`, and
 * `start()` via `Bun.spawn({ terminal })`.
 */
export class InteractiveShell {
	private terminal: Bun.Terminal | null = null;
	private proc: ReturnType<typeof Bun.spawn> | null = null;

	/** Active PTY terminal when a shell is running. */
	get activeTerminal(): Bun.Terminal | null {
		return this.terminal;
	}

	/**
	 * Spawn an interactive shell with full PTY support.
	 */
	async start(options: InteractiveShellOptions = {}): Promise<number> {
		requireInteractiveSession('Interactive shell');

		const shell = options.shell ?? process.env.SHELL ?? '/bin/sh';
		const args = options.args ?? [];
		const size = ptyDimensions({cols: options.cols, rows: options.rows});

		const terminal = createReusableTerminal({
			cols: size.cols,
			rows: size.rows,
			onData: data => writeTerminalOutput(data),
		});
		this.terminal = terminal;

		this.proc = Bun.spawn({
			cmd: [shell, ...args],
			cwd: options.cwd,
			env: spawnEnvWithTerm(options.env),
			terminal,
		});

		const proc = this.proc;
		const exitCode = await withPtySession(terminal, {stdin: true}, async () => proc.exited);

		await disposeReusableTerminal(terminal, proc);
		this.terminal = null;
		this.proc = null;

		return exitCode;
	}

	/** Write bytes to the active PTY (no-op when not started). */
	write(data: string | Uint8Array | ArrayBuffer): void {
		this.terminal?.write(data);
	}

	/** Resize the active PTY (no-op when not started). */
	resize(cols: number, rows: number): void {
		this.terminal?.resize(cols, rows);
	}

	/** Keep the PTY referenced on the event loop. */
	ref(): void {
		this.terminal?.ref();
	}

	/** Allow the process to exit while the PTY stays open. */
	unref(): void {
		this.terminal?.unref();
	}

	/** Close the active shell PTY and child process. */
	async close(): Promise<void> {
		if (this.proc && typeof this.proc.kill === 'function') {
			this.proc.kill();
		}
		if (this.terminal) {
			await disposeReusableTerminal(this.terminal, this.proc ?? undefined);
			this.terminal = null;
		}
		this.proc = null;
	}
}
