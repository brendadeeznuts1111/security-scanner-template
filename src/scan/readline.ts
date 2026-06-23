import {isInteractiveForced, isInteractiveSession} from '../utils/process.ts';

const JSON_PIPE_HINT =
	'stdin is not a TTY. Use --json for piped output or set SP_FORCE_SHELL=1 in tests.';

function assertInteractivePrompt(context: string): void {
	if (!process.stdin.isTTY && !isInteractiveForced()) {
		throw new Error(`${context} requires an interactive terminal. ${JSON_PIPE_HINT}`);
	}
}

/**
 * TTY-aware line prompt. Throws a clear error when stdin is not a TTY.
 */
export async function readlinePrompt(message: string): Promise<string> {
	assertInteractivePrompt('readlinePrompt');

	const fromPrompt = prompt(message);
	if (fromPrompt !== null) {
		return fromPrompt;
	}

	process.stdout.write(message);
	for await (const line of console) {
		return line;
	}

	return '';
}

/**
 * Yes/no confirmation with a default (`[Y/n]` when default true, `[y/N]` when false).
 */
export async function confirmPrompt(message: string, defaultYes = true): Promise<boolean> {
	const suffix = defaultYes ? '[Y/n] ' : '[y/N] ';
	const answer = (await readlinePrompt(`${message} ${suffix}`)).trim().toLowerCase();

	if (!answer) {
		return defaultYes;
	}
	return answer === 'y' || answer === 'yes';
}

/**
 * Masked password prompt with terminal clear between keystrokes.
 */
export async function passwordPrompt(message: string): Promise<string> {
	assertInteractivePrompt('passwordPrompt');

	if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
		const fallback = prompt(message);
		return fallback ?? '';
	}

	process.stdout.write(message);

	const stdin = process.stdin as NodeJS.ReadStream & {isRaw?: boolean};
	const wasRaw = stdin.isRaw ?? false;
	stdin.setRawMode(true);
	process.stdin.resume();

	let password = '';

	try {
		for await (const chunk of process.stdin) {
			const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);

			for (const char of text) {
				if (char === '\n' || char === '\r' || char === '\u0004') {
					process.stdout.write('\n');
					return password;
				}
				if (char === '\u0003') {
					process.stdout.write('\n');
					throw new Error('password prompt cancelled');
				}
				if (char === '\u007f' || char === '\b') {
					password = password.slice(0, -1);
					continue;
				}
				password += char;
				process.stdout.write('*');
			}
		}
	} finally {
		stdin.setRawMode(wasRaw);
		stdin.pause();
	}

	return password;
}

/** True when TTY prompts are available (stdin TTY or test override). */
export function canPromptInteractively(): boolean {
	return isInteractiveSession() || isInteractiveForced();
}
