import {expect, test} from 'bun:test';
import {$} from 'bun';
import {srcIndexPath} from '../helpers.ts';

test('detect-secrets-backend script prints the active backend as JSON', async () => {
	const scriptPath = new URL('../../scripts/detect-secrets-backend.ts', import.meta.url).pathname;

	const result = await $`bun run ${scriptPath}`.nothrow().quiet();
	const stdout = result.stdout.toString();
	const parsed = JSON.parse(stdout);

	expect(typeof parsed.platform).toBe('string');
	expect(typeof parsed.backend).toBe('string');
	expect(typeof parsed.available).toBe('boolean');
	expect(parsed.platform).toBe(process.platform);

	// On macOS and Windows the OS store should be available in a normal
	// development environment; on Linux it depends on a running secret service.
	if (process.platform === 'darwin') {
		expect(parsed.backend).toBe('keychain');
		expect(parsed.available).toBe(true);
	} else if (process.platform === 'win32') {
		expect(parsed.backend).toBe('credential-manager');
		expect(parsed.available).toBe(true);
	} else if (process.platform === 'linux') {
		expect(parsed.backend).toBe('libsecret');
	}
});

test('detect-secrets-backend script exits non-zero when Bun.secrets is unavailable', async () => {
	const scriptPath = `/tmp/scanner-detect-secrets-unavailable-${crypto.randomUUID()}.ts`;

	await Bun.write(
		scriptPath,
		`
		(Bun as unknown as {secrets: unknown}).secrets = undefined;
		await import('${new URL('../../scripts/detect-secrets-backend.ts', import.meta.url).pathname}');
		`,
	);

	try {
		const result = await $`bun run ${scriptPath}`.nothrow().quiet();
		expect(result.exitCode).not.toBe(0);
		const parsed = JSON.parse(result.stdout.toString());
		expect(parsed.available).toBe(false);
		expect(parsed.error).toMatch(/Bun.secrets API is not available/);
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
	}
});
