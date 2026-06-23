import {isInteractiveForced, isInteractiveSession} from '../utils/process.ts';

/**
 * Line-oriented input for the security REPL.
 *
 * Bun.Terminal does not expose a `read()` API, so command input uses the
 * console async iterator (TTY) or an injected queue (tests).
 */
export interface LineReader {
	readLine(prompt?: string): Promise<string | null>;
	close(): void;
}

export interface ConsoleLineReaderOptions {
	prompt?: string;
}

/**
 * Read lines from the console async iterator.
 */
export class ConsoleLineReader implements LineReader {
	private closed = false;

	async readLine(prompt?: string): Promise<string | null> {
		if (this.closed) return null;

		if (!process.stdin.isTTY) {
			throw new Error(
				'REPL input requires an interactive terminal (stdin is not a TTY). Use --json for piped output.',
			);
		}

		if (prompt) {
			process.stdout.write(prompt);
		}

		try {
			for await (const line of console) {
				return line;
			}
		} catch {
			return null;
		}

		return null;
	}

	close(): void {
		this.closed = true;
	}
}

/**
 * Deterministic line reader for unit tests.
 */
export class QueueLineReader implements LineReader {
	private index = 0;

	constructor(private readonly lines: readonly string[]) {}

	async readLine(_prompt?: string): Promise<string | null> {
		if (this.index >= this.lines.length) {
			return null;
		}
		return this.lines[this.index++] ?? null;
	}

	close(): void {}
}

export function createLineReader(lines?: readonly string[]): LineReader {
	if (lines) {
		return new QueueLineReader(lines);
	}
	return new ConsoleLineReader();
}

/** True when the REPL can read from stdin (TTY or test override). */
export function canReadReplInput(): boolean {
	return isInteractiveSession() || isInteractiveForced();
}
