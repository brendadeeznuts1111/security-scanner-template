import {expect, test} from 'bun:test';
import {
	EVAL_TOP_LEVEL_AWAIT_NOTE,
	getTerminalIORuntimeInfo,
	isPagerFriendlyPipeline,
	MIN_BUN_EVAL_TLA_FIX,
	MIN_BUN_PIPELINE_PAGER_FIX,
	PIPELINE_PAGER_NOTE,
} from '../../src/utils/terminal-io.ts';

test('getTerminalIORuntimeInfo reports stdio TTY flags', () => {
	const info = getTerminalIORuntimeInfo();
	expect(typeof info.stdinIsTTY).toBe('boolean');
	expect(typeof info.stdoutIsTTY).toBe('boolean');
	expect(typeof info.stderrIsTTY).toBe('boolean');
	expect(info.pipelineProducer).toBe(!info.stdoutIsTTY);
	expect(info.bunVersion).toBe(Bun.version);
	expect(info.spawnAvailable).toBe(typeof Bun.spawn === 'function');
	expect(info.terminalApiAvailable).toBe(typeof Bun.Terminal === 'function');
	expect(info.interactiveSession).toBe(Boolean(process.stdin.isTTY && process.stdout.isTTY));
	expect(info.spawnDocsUrl).toContain('bun.com/docs');
	expect(info.pipelinePagerSafe).toBe(
		Bun.semver.satisfies(Bun.version, `>=${MIN_BUN_PIPELINE_PAGER_FIX}`),
	);
	expect(info.evalTopLevelAwaitSafe).toBe(
		Bun.semver.satisfies(Bun.version, `>=${MIN_BUN_EVAL_TLA_FIX}`),
	);
});

test('pipeline note is set when stdout is a pipe', () => {
	const info = getTerminalIORuntimeInfo();
	if (info.pipelineProducer) {
		expect(info.pipelineNote).toBe(PIPELINE_PAGER_NOTE);
	} else {
		expect(info.pipelineNote).toBeUndefined();
	}
});

test('eval note is set on runtimes before the TLA fix', () => {
	const info = getTerminalIORuntimeInfo();
	if (info.evalTopLevelAwaitSafe) {
		expect(info.evalNote).toBeUndefined();
	} else {
		expect(info.evalNote).toBe(EVAL_TOP_LEVEL_AWAIT_NOTE);
	}
});

test('isPagerFriendlyPipeline matches pipeline producer and fix version', () => {
	const info = getTerminalIORuntimeInfo();
	expect(isPagerFriendlyPipeline()).toBe(
		info.pipelineProducer && info.pipelinePagerSafe,
	);
});

test('bun -p top-level await returns the final completion value', async () => {
	if (!Bun.semver.satisfies(Bun.version, `>=${MIN_BUN_EVAL_TLA_FIX}`)) {
		return;
	}

	const proc = Bun.spawn(['bun', '-p', '(await Promise.resolve(1)) + 1'], {
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const {readSpawnText} = await import('../../src/utils/process.ts');
	const [stdout, stderr, exitCode] = await Promise.all([
		readSpawnText(proc.stdout),
		readSpawnText(proc.stderr),
		proc.exited,
	]);

	expect(exitCode).toBe(0);
	expect(stderr).toBe('');
	expect(stdout.trim()).toBe('2');
});