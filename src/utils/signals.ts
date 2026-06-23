/**
 * OS signal helpers aligned with Bun process signal guides.
 *
 * @see https://bun.com/docs/guides/process/os-signals
 * @see https://bun.com/docs/guides/process/ctrl-c
 * @see https://github.com/oven-sh/bun/blob/main/docs/guides/process/os-signals.mdx
 * @see https://github.com/oven-sh/bun/blob/main/docs/guides/process/ctrl-c.mdx
 */

export const BUN_OS_SIGNALS_GUIDE_URL = 'https://bun.com/docs/guides/process/os-signals';
export const BUN_CTRL_C_GUIDE_URL = 'https://bun.com/docs/guides/process/ctrl-c';
export const BUN_OS_SIGNALS_DOCS_URL =
	'https://bun.com/docs/guides/process/os-signals#listen-to-os-signals';
export const BUN_CTRL_C_DOCS_URL = 'https://bun.com/docs/guides/process/ctrl-c#listen-for-ctrl-c';

export function isSignalHandlingAvailable(): boolean {
	return typeof process.on === 'function' && typeof process.once === 'function';
}

/** Signals used for operator interrupt (Ctrl+C and graceful termination). */
export const INTERRUPT_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

export type InterruptSignal = (typeof INTERRUPT_SIGNALS)[number];

export type SignalHandler = (...args: unknown[]) => void;

export interface SignalListenerOptions {
	/** Use `process.once` instead of `process.on` (default: false). */
	once?: boolean;
	/** Signals to listen for (default: {@link INTERRUPT_SIGNALS}). */
	signals?: readonly InterruptSignal[];
}

export interface SignalRuntimeInfo {
	interruptSignals: readonly InterruptSignal[];
	osSignalsDocsUrl: string;
	ctrlCDocsUrl: string;
}

/** Snapshot signal handling capabilities for doctor / CLI diagnostics. */
export function getSignalRuntimeInfo(): SignalRuntimeInfo {
	return {
		interruptSignals: INTERRUPT_SIGNALS,
		osSignalsDocsUrl: BUN_OS_SIGNALS_DOCS_URL,
		ctrlCDocsUrl: BUN_CTRL_C_DOCS_URL,
	};
}

/** Operator notes for Bun process signal handling. */
export const SIGNAL_BEHAVIOR = {
	sigint: 'Ctrl+C sends SIGINT — process.on("SIGINT", handler)',
	sigterm: 'SIGTERM for graceful shutdown (containers, kill)',
	explicitExit: 'SIGINT does not exit by default — call process.exit() to terminate',
	beforeExit: 'process.on("beforeExit") when the event loop is empty',
	exit: 'process.on("exit", code => …) on process termination',
} as const;

function registerSignal(signal: InterruptSignal, handler: SignalHandler, once: boolean): void {
	if (once) {
		process.once(signal, handler);
		return;
	}
	process.on(signal, handler);
}

function unregisterSignal(signal: InterruptSignal, handler: SignalHandler): void {
	process.off(signal, handler);
}

/**
 * Listen for OS signals via `process.on` / `process.once`.
 * @see {@link BUN_OS_SIGNALS_DOCS_URL}
 */
export function onInterruptSignals(
	handler: SignalHandler,
	options: SignalListenerOptions = {},
): () => void {
	const signals = options.signals ?? INTERRUPT_SIGNALS;
	const once = options.once ?? false;

	for (const signal of signals) {
		registerSignal(signal, handler, once);
	}

	return () => {
		for (const signal of signals) {
			unregisterSignal(signal, handler);
		}
	};
}

/**
 * Listen for Ctrl+C (`SIGINT`). Call `process.exit()` inside the handler to exit.
 * @see {@link BUN_CTRL_C_DOCS_URL}
 */
export function onCtrlC(handler: SignalHandler, options?: {once?: boolean}): () => void {
	return onInterruptSignals(handler, {once: options?.once, signals: ['SIGINT']});
}

export interface ProcessExitHandlers {
	beforeExit?: (code: number) => void;
	exit?: (code: number) => void;
}

/**
 * Register `beforeExit` / `exit` listeners when the signal name is unknown.
 * @see {@link BUN_OS_SIGNALS_DOCS_URL}
 */
export function onProcessExit(handlers: ProcessExitHandlers): () => void {
	if (handlers.beforeExit) {
		process.on('beforeExit', handlers.beforeExit);
	}
	if (handlers.exit) {
		process.on('exit', handlers.exit);
	}

	return () => {
		if (handlers.beforeExit) {
			process.off('beforeExit', handlers.beforeExit);
		}
		if (handlers.exit) {
			process.off('exit', handlers.exit);
		}
	};
}

/**
 * Wait until the process receives an interrupt signal (long-running operator sessions).
 */
export function waitForInterruptSignal(
	signals: readonly InterruptSignal[] = INTERRUPT_SIGNALS,
): Promise<InterruptSignal> {
	return new Promise(resolve => {
		const disposers: Array<() => void> = [];

		for (const signal of signals) {
			disposers.push(
				onInterruptSignals(
					() => {
						for (const dispose of disposers) {
							dispose();
						}
						resolve(signal);
					},
					{once: true, signals: [signal]},
				),
			);
		}
	});
}

/** AbortController that aborts on SIGINT / SIGTERM. */
export function interruptAbortController(signals: readonly InterruptSignal[] = INTERRUPT_SIGNALS): {
	controller: AbortController;
	signal: AbortSignal;
	dispose: () => void;
} {
	const controller = new AbortController();
	const dispose = onInterruptSignals(
		() => {
			controller.abort();
			dispose();
		},
		{once: true, signals},
	);
	return {controller, signal: controller.signal, dispose};
}

/** Bun.inspect.table of signal handling patterns for operator docs. */
export function formatSignalBehaviorTable(): string {
	return Bun.inspect.table(
		[
			{event: 'SIGINT', trigger: 'Ctrl+C', api: SIGNAL_BEHAVIOR.sigint},
			{event: 'SIGTERM', trigger: 'kill / container stop', api: SIGNAL_BEHAVIOR.sigterm},
			{event: 'exit', trigger: 'process termination', api: SIGNAL_BEHAVIOR.explicitExit},
			{event: 'beforeExit', trigger: 'empty event loop', api: SIGNAL_BEHAVIOR.beforeExit},
		],
		['event', 'trigger', 'api'],
	);
}
