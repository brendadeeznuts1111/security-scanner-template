import {DEFAULT_TERM_NAME} from '../utils/process.ts';
import {isPagerFriendlyPipeline} from '../utils/terminal-io.ts';

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

export interface PtyTerminal {
	write(data: string | Uint8Array | ArrayBuffer): void;
	resize(cols: number, rows: number): void;
	close(): void;
	setRawMode?(enabled: boolean): void;
	ref?(): void;
	unref?(): void;
}

export interface SpawnTerminalOptions {
	cols: number;
	rows: number;
	name: string;
	data: (term: PtyTerminal, data: Uint8Array) => void;
}

function defaultCols(): number {
	return process.stdout.columns ?? 80;
}

function defaultRows(): number {
	return process.stdout.rows ?? 24;
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
 * Factory for Bun.spawn `terminal` option per Bun PTY docs.
 * @see https://bun.com/docs/runtime/child-process#terminal-pty-support
 */
export function createSpawnTerminalOptions(
	onData: (data: Uint8Array) => void,
	dimensions: PtyDimensions = ptyDimensions(),
): SpawnTerminalOptions {
	return {
		cols: dimensions.cols,
		rows: dimensions.rows,
		name: DEFAULT_TERM_NAME,
		data(_term, data) {
			onData(data);
		},
	};
}

/**
 * Attach stdin forwarding and resize propagation to a Bun.spawn PTY terminal.
 *
 * Prefers `terminal.setRawMode()` when available (Bun.Terminal API). Falls back
 * to `process.stdin.setRawMode()` for test doubles. Resize listeners attach only
 * when stdout is a TTY (`process.stdout.on('resize')`).
 */
export function attachPty(terminal: PtyTerminal, options: PtyAttachOptions = {}): () => void {
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
	terminal: PtyTerminal,
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