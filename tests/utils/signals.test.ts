import {expect, test} from 'bun:test';
import {
	BUN_CTRL_C_DOCS_URL,
	BUN_CTRL_C_GUIDE_URL,
	BUN_OS_SIGNALS_DOCS_URL,
	BUN_OS_SIGNALS_GUIDE_URL,
	INTERRUPT_SIGNALS,
	SIGNAL_BEHAVIOR,
	formatSignalBehaviorTable,
	interruptAbortController,
	isSignalHandlingAvailable,
	onCtrlC,
	onInterruptSignals,
	onProcessExit,
	waitForInterruptSignal,
} from '../../src/utils/signals.ts';

test('signal docs URLs point at bun.com guides', () => {
	expect(BUN_OS_SIGNALS_GUIDE_URL).toBe('https://bun.com/docs/guides/process/os-signals');
	expect(BUN_CTRL_C_GUIDE_URL).toBe('https://bun.com/docs/guides/process/ctrl-c');
	expect(BUN_OS_SIGNALS_DOCS_URL).toContain('listen-to-os-signals');
	expect(BUN_CTRL_C_DOCS_URL).toContain('listen-for-ctrl-c');
	expect(SIGNAL_BEHAVIOR.explicitExit).toContain('process.exit');
});

test('isSignalHandlingAvailable reflects process signal APIs', () => {
	expect(isSignalHandlingAvailable()).toBe(true);
});

test('formatSignalBehaviorTable documents SIGINT and SIGTERM', () => {
	const table = formatSignalBehaviorTable();
	expect(table).toContain('SIGINT');
	expect(table).toContain('SIGTERM');
});

test('onInterruptSignals registers and disposes listeners', () => {
	let calls = 0;
	const dispose = onInterruptSignals(() => {
		calls += 1;
	});

	process.emit('SIGINT');
	expect(calls).toBe(1);

	dispose();
	process.emit('SIGINT');
	expect(calls).toBe(1);
});

test('onCtrlC listens only for SIGINT', () => {
	let calls = 0;
	const dispose = onCtrlC(() => {
		calls += 1;
	});

	process.emit('SIGTERM');
	expect(calls).toBe(0);
	process.emit('SIGINT');
	expect(calls).toBe(1);
	dispose();
});

test('waitForInterruptSignal resolves with the received signal', async () => {
	const promise = waitForInterruptSignal(['SIGINT']);
	process.emit('SIGINT');
	expect(await promise).toBe('SIGINT');
});

test('interruptAbortController aborts on interrupt', () => {
	const {signal, dispose} = interruptAbortController(['SIGTERM']);
	expect(signal.aborted).toBe(false);
	process.emit('SIGTERM');
	expect(signal.aborted).toBe(true);
	dispose();
});

test('onProcessExit registers beforeExit and exit handlers', () => {
	let beforeExitCode: number | undefined;
	let exitCode: number | undefined;

	const dispose = onProcessExit({
		beforeExit: code => {
			beforeExitCode = code;
		},
		exit: code => {
			exitCode = code;
		},
	});

	process.emit('beforeExit', 0);
	expect(beforeExitCode).toBe(0);

	dispose();
	process.emit('beforeExit', 1);
	expect(beforeExitCode).toBe(0);

	void exitCode;
	expect(INTERRUPT_SIGNALS).toEqual(['SIGINT', 'SIGTERM']);
});
