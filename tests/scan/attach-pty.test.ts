import {expect, test} from 'bun:test';
import {
	attachPty,
	createSpawnTerminalOptions,
	ptyDimensions,
	terminalOutputMode,
	withPtySession,
	writeTerminalOutput,
} from '../../src/scan/terminal.ts';

test('createSpawnTerminalOptions includes name and dimensions', () => {
	const options = createSpawnTerminalOptions(() => {}, {cols: 100, rows: 40});
	expect(options.cols).toBe(100);
	expect(options.rows).toBe(40);
	expect(options.name).toBe('xterm-256color');
	expect(typeof options.data).toBe('function');
});

test('ptyDimensions defaults to positive cols and rows', () => {
	const dims = ptyDimensions();
	expect(dims.cols).toBeGreaterThan(0);
	expect(dims.rows).toBeGreaterThan(0);
});

test('attachPty returns cleanup that can be invoked twice', () => {
	let rawMode: boolean | undefined;
	const terminal = {
		write: () => {},
		resize: () => {},
		close: () => {},
		setRawMode(enabled: boolean) {
			rawMode = enabled;
		},
	};

	const detach = attachPty(terminal, {stdin: false});
	detach();
	detach();
	expect(rawMode).toBeUndefined();
});

test('withPtySession returns run result', async () => {
	const terminal = {
		write: () => {},
		resize: () => {},
		close: () => {},
		setRawMode: () => {},
	};

	const value = await withPtySession(terminal, {stdin: false}, async () => 42);
	expect(value).toBe(42);
});

test('withPtySession propagates errors from run', async () => {
	const terminal = {
		write: () => {},
		resize: () => {},
		close: () => {},
		setRawMode: () => {},
	};

	await expect(
		withPtySession(terminal, {stdin: false}, async () => {
			throw new Error('boom');
		}),
	).rejects.toThrow('boom');
});

test('terminalOutputMode reflects stdout TTY or pipeline safety', () => {
	const mode = terminalOutputMode();
	if (process.stdout.isTTY) {
		expect(mode).toBe('tty');
	} else {
		expect(['pipe-pager-safe', 'pipe-legacy']).toContain(mode);
	}
});

test('writeTerminalOutput accepts string and bytes', () => {
	expect(() => writeTerminalOutput('ok')).not.toThrow();
	expect(() => writeTerminalOutput(new TextEncoder().encode('ok'))).not.toThrow();
});