import {expect, test} from 'bun:test';
import {emitResults, type OutputFormat} from '../../src/cli/formatters.ts';

function captureOutput(fn: () => void): {stdout: string; stderr: string} {
	const originalStdout = console.log;
	const originalStderr = console.error;
	const stdout: string[] = [];
	const stderr: string[] = [];

	console.log = (...args: unknown[]) => {
		stdout.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
	};
	console.error = (...args: unknown[]) => {
		stderr.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
	};

	try {
		fn();
	} finally {
		console.log = originalStdout;
		console.error = originalStderr;
	}

	return {stdout: stdout.join('\n'), stderr: stderr.join('\n')};
}

function advisoryFixture(level: 'fatal' | 'warn', pkg: string): Bun.Security.Advisory {
	return {
		level,
		package: pkg,
		url: 'https://example.com',
		description: 'Test',
		categories: ['malware'],
	};
}

test('JSON format emits sorted payload to stdout', () => {
	const {stdout, stderr} = captureOutput(() => {
		emitResults([advisoryFixture('warn', 'b'), advisoryFixture('fatal', 'a')], 'json', {
			durationMs: 10,
			feedSource: 'test',
			dryRun: false,
		});
	});

	expect(stdout.length).toBeGreaterThan(0);
	expect(stderr.length).toBe(0);

	const payload = JSON.parse(stdout);
	expect(payload.ok).toBe(false);
	expect(payload.advisories[0]?.package).toBe('a');
	expect(payload.advisories[0]?.level).toBe('fatal');
	expect(payload.meta.dryRun).toBe(false);
});

test('JSON format reports ok when no advisories', () => {
	const {stdout} = captureOutput(() => {
		emitResults([], 'json', {durationMs: 5, feedSource: 'test', dryRun: false});
	});

	const payload = JSON.parse(stdout);
	expect(payload.ok).toBe(true);
	expect(payload.advisories.length).toBe(0);
});

test('Human format writes to stderr', () => {
	const {stdout, stderr} = captureOutput(() => {
		emitResults([advisoryFixture('fatal', 'bad-pkg')], 'human', {
			durationMs: 5,
			feedSource: 'test',
			dryRun: false,
		});
	});

	expect(stdout.length).toBe(0);
	expect(stderr).toContain('bad-pkg');
	expect(stderr).toContain('fatal');
});

test('Human format prints success message when no advisories', () => {
	const {stdout, stderr} = captureOutput(() => {
		emitResults([], 'human', {durationMs: 5, feedSource: 'test', dryRun: false});
	});

	expect(stdout.length).toBe(0);
	expect(stderr).toContain('No threats detected');
});
