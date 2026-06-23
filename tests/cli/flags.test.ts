import {expect, test} from 'bun:test';
import path from 'path';

const ROOT = path.join(import.meta.dir, '../..');
const FLAGS_CLI = path.join(ROOT, 'src/cli/flags.ts');

test('flags CLI lists compile-time features with --json', async () => {
	const proc = Bun.spawn(['bun', 'run', FLAGS_CLI, '--json'], {
		cwd: ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const stdout = await new Response(proc.stdout).text();
	const exitCode = await proc.exited;
	expect(exitCode).toBe(0);
	const payload = JSON.parse(stdout) as {flags: {name: string; enabled: boolean}[]};
	expect(payload.flags.length).toBeGreaterThan(0);
	expect(payload.flags.some(row => row.name === 'AUDIT_JSONL')).toBe(true);
});

test('flags CLI accepts deployment profile filter', async () => {
	const proc = Bun.spawn(['bun', 'run', FLAGS_CLI, '--profile', 'agent', '--json'], {
		cwd: ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const stdout = await new Response(proc.stdout).text();
	const exitCode = await proc.exited;
	expect(exitCode).toBe(0);
	const payload = JSON.parse(stdout) as {profile: string; features: string[]};
	expect(payload.profile).toBe('agent');
	expect(payload.features).toContain('AUDIT_JSONL');
	expect(payload.features).toContain('SCAN_EXTERNAL');
});
