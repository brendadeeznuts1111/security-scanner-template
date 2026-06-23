import {expect, test} from 'bun:test';
import {INTERACTIVE_FORCE_ENV} from '../../src/utils/process.ts';
import {canPromptInteractively, confirmPrompt, readlinePrompt} from '../../src/scan/readline.ts';

test('readlinePrompt throws when stdin is not a TTY', async () => {
	if (process.stdin.isTTY) {
		return;
	}

	await expect(readlinePrompt('token: ')).rejects.toThrow('requires an interactive terminal');
});

test('canPromptInteractively respects force env', () => {
	const prev = process.env[INTERACTIVE_FORCE_ENV];
	process.env[INTERACTIVE_FORCE_ENV] = '1';
	try {
		expect(canPromptInteractively()).toBe(true);
	} finally {
		if (prev === undefined) {
			delete process.env[INTERACTIVE_FORCE_ENV];
		} else {
			process.env[INTERACTIVE_FORCE_ENV] = prev;
		}
	}
});

test('confirmPrompt defaults to yes on empty answer', async () => {
	if (!process.stdin.isTTY) {
		return;
	}

	const originalPrompt = globalThis.prompt;
	globalThis.prompt = () => '';
	try {
		expect(await confirmPrompt('Continue?', true)).toBe(true);
		expect(await confirmPrompt('Continue?', false)).toBe(false);
	} finally {
		globalThis.prompt = originalPrompt;
	}
});
