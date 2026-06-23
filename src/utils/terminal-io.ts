/**
 * Stdio / pipeline runtime diagnostics for Bun CLI fixes.
 *
 * Bun >= 1.3.14 no longer restores startup termios at exit when stdout is a
 * pipe, so downstream pagers (less, fzf, fx) keep raw mode. TTY stdout still
 * gets unconditional restore (watch reload, crash handlers, interactive tools).
 *
 * @see https://bun.com/docs/runtime/child-process#terminal-pty-support
 * @see https://bun.com/reference/bun/Terminal
 */

import {
	BUN_SPAWN_DOCS_URL,
	BUN_TERMINAL_DOCS_URL,
	getProcessRuntimeInfo,
	isInteractiveSession,
} from './process.ts';

/** Bun release where piped producers stop clobbering downstream pager termios. */
export const MIN_BUN_PIPELINE_PAGER_FIX = '1.3.14';

/** Bun release where `bun -p` returns the final top-level await completion value. */
export const MIN_BUN_EVAL_TLA_FIX = '1.3.14';

export const PIPELINE_PAGER_NOTE =
	'Bun >= 1.3.14 skips exit-time termios restore on fds it never modified, so piped output (e.g. bun sp doctor --json | fx) no longer breaks less/fzf key handling.';

export const EVAL_TOP_LEVEL_AWAIT_NOTE =
	'Bun >= 1.3.14: bun -p returns the final top-level await value (e.g. bun -p "(await 1) + 1" prints 2).';

export const WINDOWS_CONPTY_NOTE =
	'On Windows, Bun.Terminal uses ConPTY; termios flags are no-ops and setRawMode on the parent PTY does not affect the child console mode.';

export interface TerminalIORuntimeInfo {
	stdinIsTTY: boolean;
	stdoutIsTTY: boolean;
	stderrIsTTY: boolean;
	/** True when stdout is not a TTY (producer in a pipeline). */
	pipelineProducer: boolean;
	/** Piped producers no longer overwrite downstream pager termios at exit. */
	pipelinePagerSafe: boolean;
	/** `bun -p` with top-level await returns the completion value. */
	evalTopLevelAwaitSafe: boolean;
	/** Both stdin and stdout are TTYs (REPL / interactive scan). */
	interactiveSession: boolean;
	spawnAvailable: boolean;
	terminalApiAvailable: boolean;
	platform: NodeJS.Platform;
	bunVersion: string;
	spawnDocsUrl: string;
	terminalDocsUrl: string;
	pipelineNote?: string;
	evalNote?: string;
	platformNote?: string;
}

function bunSupportsPipelinePagerFix(): boolean {
	return Bun.semver.satisfies(Bun.version, `>=${MIN_BUN_PIPELINE_PAGER_FIX}`);
}

function bunSupportsEvalTopLevelAwaitFix(): boolean {
	return Bun.semver.satisfies(Bun.version, `>=${MIN_BUN_EVAL_TLA_FIX}`);
}

/** Snapshot stdio TTY state and Bun pipeline/eval compatibility flags. */
export function getTerminalIORuntimeInfo(): TerminalIORuntimeInfo {
	const processInfo = getProcessRuntimeInfo();
	const stdoutIsTTY = Boolean(process.stdout.isTTY);
	const pipelineProducer = !stdoutIsTTY;

	const info: TerminalIORuntimeInfo = {
		stdinIsTTY: Boolean(process.stdin.isTTY),
		stdoutIsTTY,
		stderrIsTTY: Boolean(process.stderr.isTTY),
		pipelineProducer,
		pipelinePagerSafe: bunSupportsPipelinePagerFix(),
		evalTopLevelAwaitSafe: bunSupportsEvalTopLevelAwaitFix(),
		interactiveSession: processInfo.interactiveSession,
		spawnAvailable: processInfo.spawnAvailable,
		terminalApiAvailable: processInfo.terminalAvailable,
		platform: processInfo.platform,
		bunVersion: Bun.version,
		spawnDocsUrl: BUN_SPAWN_DOCS_URL,
		terminalDocsUrl: BUN_TERMINAL_DOCS_URL,
	};

	if (pipelineProducer) {
		info.pipelineNote = PIPELINE_PAGER_NOTE;
	}

	if (!info.evalTopLevelAwaitSafe) {
		info.evalNote = EVAL_TOP_LEVEL_AWAIT_NOTE;
	}

	if (processInfo.platform === 'win32') {
		info.platformNote = WINDOWS_CONPTY_NOTE;
	}

	return info;
}

/** True when piping this process to a pager should not break downstream termios. */
export function isPagerFriendlyPipeline(): boolean {
	const info = getTerminalIORuntimeInfo();
	return info.pipelineProducer && info.pipelinePagerSafe;
}

export {isInteractiveForced, isInteractiveSession} from './process.ts';
