import {ptyDimensions, writeTerminalOutput} from '../scan/terminal.ts';
import {isInteractiveForced, isInteractiveSession} from '../utils/process.ts';

export interface ShellTerminalOptions {
	cols?: number;
	rows?: number;
	/** Forward REPL text and PTY output to process.stdout (default: true). */
	stdout?: boolean;
	/** Keep the event loop alive while the terminal is open (default: true in REPL). */
	keepAlive?: boolean;
}

/**
 * Shared Bun.Terminal session for the security REPL.
 *
 * REPL messages are written directly to stdout. The Bun.Terminal instance is
 * reused for external scanner spawns so operators keep one PTY across commands.
 *
 * @see https://bun.sh/docs/runtime/child-process#terminal-pty-support
 */
export class ShellTerminal {
	readonly terminal: Bun.Terminal;
	private readonly forwardStdout: boolean;
	private closed = false;
	private readonly onResize: () => void;

	constructor(options: ShellTerminalOptions = {}) {
		this.forwardStdout = options.stdout !== false;
		const size = ptyDimensions({cols: options.cols, rows: options.rows});

		this.terminal = new Bun.Terminal({
			cols: size.cols,
			rows: size.rows,
			data: (_term, data) => {
				if (this.forwardStdout && !this.closed) {
					writeTerminalOutput(data);
				}
			},
		});

		if (options.keepAlive !== false) {
			this.terminal.ref();
		}

		this.onResize = () => {
			if (this.closed) return;
			const dims = ptyDimensions();
			this.terminal.resize(dims.cols, dims.rows);
		};

		if (process.stdout.isTTY) {
			process.stdout.on('resize', this.onResize);
		}
	}

	write(data: string): void {
		if (this.closed) return;
		if (this.forwardStdout) {
			writeTerminalOutput(data);
		}
	}

	writeln(data: string): void {
		this.write(`${data}\n`);
	}

	resize(cols: number, rows: number): void {
		if (!this.closed) {
			this.terminal.resize(cols, rows);
		}
	}

	close(): void {
		if (!this.closed) {
			this.closed = true;
			if (process.stdout.isTTY) {
				process.stdout.off('resize', this.onResize);
			}
			this.terminal.unref();
			this.terminal.close();
		}
	}

	/** Whether this session can accept interactive REPL input. */
	static canRunInteractive(): boolean {
		return isInteractiveSession() || isInteractiveForced();
	}
}
