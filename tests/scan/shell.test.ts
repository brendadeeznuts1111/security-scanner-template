import {expect, test} from 'bun:test';
import {canRunInteractive, InteractiveShell} from '../../src/scan/shell.ts';
import {INTERACTIVE_FORCE_ENV} from '../../src/utils/process.ts';

test('canRunInteractive matches session or force env', () => {
	const prev = process.env[INTERACTIVE_FORCE_ENV];
	process.env[INTERACTIVE_FORCE_ENV] = '1';
	try {
		expect(canRunInteractive()).toBe(true);
	} finally {
		if (prev === undefined) {
			delete process.env[INTERACTIVE_FORCE_ENV];
		} else {
			process.env[INTERACTIVE_FORCE_ENV] = prev;
		}
	}
});

test('InteractiveShell.start requires interactive session', async () => {
	if (process.stdin.isTTY && process.stdout.isTTY) {
		return;
	}

	const shell = new InteractiveShell();
	await expect(shell.start()).rejects.toThrow('requires an interactive terminal');
});

test('createReusableTerminal is exported from scan terminal module', async () => {
	const {createReusableTerminal, disposeReusableTerminal} = await import(
		'../../src/scan/terminal.ts'
	);
	if (typeof Bun.Terminal !== 'function') {
		return;
	}

	const terminal = createReusableTerminal({keepAlive: false});
	expect(typeof terminal.write).toBe('function');
	expect(typeof terminal.resize).toBe('function');
	await disposeReusableTerminal(terminal);
});
