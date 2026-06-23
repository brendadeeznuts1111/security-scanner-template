import {expect, test} from 'bun:test';
import {$} from 'bun';
import {setupEnvCleanup, srcIndexPath} from '../helpers.ts';

setupEnvCleanup();

test('--store-token stores the token via Bun.secrets.set', async () => {
	const scriptPath = `/tmp/scanner-store-token-test-${crypto.randomUUID()}.ts`;
	const outPath = `/tmp/scanner-store-token-out-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		const calls: {service: string; name: string; value: string}[] = [];
		(Bun as unknown as {secrets: unknown}).secrets = {
			get: async () => null,
			set: async (opts: {service: string; name: string; value: string}) => {
				calls.push({service: opts.service, name: opts.name, value: opts.value});
				await Bun.write('${outPath}', JSON.stringify(calls));
			},
			delete: async () => true,
		};
		await import('${srcIndexPath}');
		`,
	);

	try {
		// --store-token-value avoids needing an interactive prompt in the subprocess.
		await $`bun run ${scriptPath} --store-token --threat-feed-token-name my-token --store-token-value ghp_test123`
			.env({...process.env, THREAT_FEED_TOKEN_SERVICE: 'test-service'})
			.quiet();

		const calls = JSON.parse(await Bun.file(outPath).text());
		// First call is the pre-flight write probe, second call stores the real token.
		expect(calls).toEqual([
			{service: 'test-service', name: '__scanner_store_test__', value: 'probe'},
			{service: 'test-service', name: 'my-token', value: 'ghp_test123'},
		]);
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(outPath)
			.delete()
			.catch(() => {});
	}
});

test('--store-token reads token from piped stdin via console async iterator', async () => {
	const scriptPath = `/tmp/scanner-store-token-stdin-${crypto.randomUUID()}.ts`;
	const outPath = `/tmp/scanner-store-token-stdin-out-${crypto.randomUUID()}.txt`;
	const errPath = `/tmp/scanner-store-token-stdin-err-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		(globalThis as unknown as {prompt: unknown}).prompt = () => null;
		const calls: {service: string; name: string; value: string}[] = [];
		(Bun as unknown as {secrets: unknown}).secrets = {
			get: async () => null,
			set: async (opts: {service: string; name: string; value: string}) => {
				calls.push({service: opts.service, name: opts.name, value: opts.value});
				await Bun.write('${outPath}', JSON.stringify(calls));
			},
			delete: async () => true,
		};
		await import('${srcIndexPath}');
		`,
	);

	try {
		// Pipe the token via stdin; omit --store-token-value and force prompt()
		// to return null so the console async iterator fallback is exercised.
		await $`echo "piped-stdin-token" | bun run ${scriptPath} --store-token --threat-feed-token-name my-token 2> ${errPath}`
			.env({...process.env, THREAT_FEED_TOKEN_SERVICE: 'test-service'})
			.quiet();

		const calls = JSON.parse(await Bun.file(outPath).text());
		expect(calls).toEqual([
			{service: 'test-service', name: '__scanner_store_test__', value: 'probe'},
			{service: 'test-service', name: 'my-token', value: 'piped-stdin-token'},
		]);

		const stderr = await Bun.file(errPath).text();
		expect(stderr).toContain('Enter token for test-service/my-token');
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(outPath)
			.delete()
			.catch(() => {});
		await Bun.file(errPath)
			.delete()
			.catch(() => {});
	}
});

test('--store-token exits with error when the keychain write probe fails', async () => {
	const scriptPath = `/tmp/scanner-store-token-probe-fails-${crypto.randomUUID()}.ts`;
	const errPath = `/tmp/scanner-store-token-probe-fails-err-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		let callCount = 0;
		(Bun as unknown as {secrets: unknown}).secrets = {
			get: async () => null,
			set: async () => {
				callCount++;
				if (callCount === 1) throw new Error('keychain locked');
			},
			delete: async () => true,
		};
		await import('${srcIndexPath}');
		`,
	);

	try {
		await $`bun run ${scriptPath} --store-token --threat-feed-token-name my-token --store-token-value ghp_test 2> ${errPath}`
			.env({...process.env, THREAT_FEED_TOKEN_SERVICE: 'test-service'})
			.quiet();
		// Should have exited non-zero; if we reach here, fail.
		expect(true).toBe(false);
	} catch {
		// Expected: non-zero exit.
	} finally {
		const stderr = await Bun.file(errPath).text();
		expect(stderr).toContain('keychain write probe failed');
		expect(stderr).toContain('keychain locked');
		expect(stderr).toContain('Check that your keychain/keyring is unlocked');
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(errPath)
			.delete()
			.catch(() => {});
	}
});

test('--store-token warns but continues when the keychain write probe cleanup fails', async () => {
	const scriptPath = `/tmp/scanner-store-token-probe-cleanup-fails-${crypto.randomUUID()}.ts`;
	const outPath = `/tmp/scanner-store-token-probe-cleanup-fails-out-${crypto.randomUUID()}.txt`;
	const errPath = `/tmp/scanner-store-token-probe-cleanup-fails-err-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		const calls: {service: string; name: string; value: string}[] = [];
		(Bun as unknown as {secrets: unknown}).secrets = {
			get: async () => null,
			set: async (opts: {service: string; name: string; value: string}) => {
				calls.push({service: opts.service, name: opts.name, value: opts.value});
				await Bun.write('${outPath}', JSON.stringify(calls));
			},
			delete: async () => false,
		};
		await import('${srcIndexPath}');
		`,
	);

	try {
		await $`bun run ${scriptPath} --store-token --threat-feed-token-name my-token --store-token-value ghp_test123 2> ${errPath}`
			.env({...process.env, THREAT_FEED_TOKEN_SERVICE: 'test-service'})
			.quiet();

		const calls = JSON.parse(await Bun.file(outPath).text());
		expect(calls).toEqual([
			{service: 'test-service', name: '__scanner_store_test__', value: 'probe'},
			{service: 'test-service', name: 'my-token', value: 'ghp_test123'},
		]);

		const stderr = await Bun.file(errPath).text();
		expect(stderr).toContain('keychain write probe cleanup returned false');
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(outPath)
			.delete()
			.catch(() => {});
		await Bun.file(errPath)
			.delete()
			.catch(() => {});
	}
});

test('--clear-token deletes the token via Bun.secrets.delete', async () => {
	const scriptPath = `/tmp/scanner-clear-token-test-${crypto.randomUUID()}.ts`;
	const outPath = `/tmp/scanner-clear-token-out-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		(Bun as unknown as {secrets: unknown}).secrets = {
			get: async () => null,
			set: async () => {},
			delete: async () => {
				await Bun.write('${outPath}', JSON.stringify({deleted: true}));
				return true;
			},
		};
		await import('${srcIndexPath}');
		`,
	);

	try {
		await $`bun run ${scriptPath} --clear-token --threat-feed-token-name my-token`
			.env({...process.env, THREAT_FEED_TOKEN_SERVICE: 'test-service'})
			.quiet();

		const result = JSON.parse(await Bun.file(outPath).text());
		expect(result).toEqual({deleted: true});
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(outPath)
			.delete()
			.catch(() => {});
	}
});

test('--store-token without --threat-feed-token-name exits with error', async () => {
	const scriptPath = `/tmp/scanner-store-token-no-name-${crypto.randomUUID()}.ts`;

	await Bun.write(
		scriptPath,
		`
		(Bun as unknown as {secrets: unknown}).secrets = {
			get: async () => null,
			set: async () => {},
			delete: async () => true,
		};
		await import('${srcIndexPath}');
		`,
	);

	try {
		await $`bun run ${scriptPath} --store-token --store-token-value ghp_test`.quiet();
		expect(true).toBe(false);
	} catch {
		// Expected: non-zero exit.
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
	}
});

test('--list-token reports present without printing the value', async () => {
	const scriptPath = `/tmp/scanner-list-token-present-${crypto.randomUUID()}.ts`;
	const outPath = `/tmp/scanner-list-token-present-out-${crypto.randomUUID()}.txt`;
	const errPath = `/tmp/scanner-list-token-present-err-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		(Bun as unknown as {secrets: unknown}).secrets = {
			get: async () => {
				await Bun.write('${outPath}', JSON.stringify({getCalled: true}));
				return 'super-secret-never-printed';
			},
			set: async () => {},
			delete: async () => true,
		};
		await import('${srcIndexPath}');
		`,
	);

	try {
		// Redirect stderr to a file so we can inspect it without exposing the
		// token value in the test's own stdout.
		await $`bun run ${scriptPath} --list-token --threat-feed-token-name my-token 2> ${errPath}`
			.env({...process.env, THREAT_FEED_TOKEN_SERVICE: 'test-service'})
			.quiet();

		const result = JSON.parse(await Bun.file(outPath).text());
		expect(result).toEqual({getCalled: true});

		const stderr = await Bun.file(errPath).text();
		// The token value must never appear in stderr.
		expect(stderr).not.toContain('super-secret-never-printed');
		expect(stderr).toContain('token present');
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(outPath)
			.delete()
			.catch(() => {});
		await Bun.file(errPath)
			.delete()
			.catch(() => {});
	}
});

test('--list-token reports absent when Bun.secrets.get returns null', async () => {
	const scriptPath = `/tmp/scanner-list-token-absent-${crypto.randomUUID()}.ts`;
	const errPath = `/tmp/scanner-list-token-absent-err-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		(Bun as unknown as {secrets: unknown}).secrets = {
			get: async () => null,
			set: async () => {},
			delete: async () => false,
		};
		await import('${srcIndexPath}');
		`,
	);

	try {
		await $`bun run ${scriptPath} --list-token --threat-feed-token-name my-token 2> ${errPath}`
			.env({...process.env, THREAT_FEED_TOKEN_SERVICE: 'test-service'})
			.quiet();

		const stderr = await Bun.file(errPath).text();
		expect(stderr).toContain('no token found');
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(errPath)
			.delete()
			.catch(() => {});
	}
});

test('--store-token exits with error when Bun.secrets.set throws', async () => {
	const scriptPath = `/tmp/scanner-store-token-throws-${crypto.randomUUID()}.ts`;
	const errPath = `/tmp/scanner-store-token-throws-err-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		let callCount = 0;
		(Bun as unknown as {secrets: unknown}).secrets = {
			get: async () => null,
			set: async () => {
				callCount++;
				// Let the pre-flight probe succeed, then fail the real store.
				if (callCount === 2) throw new Error('keychain locked');
			},
			delete: async () => true,
		};
		await import('${srcIndexPath}');
		`,
	);

	try {
		await $`bun run ${scriptPath} --store-token --threat-feed-token-name my-token --store-token-value ghp_test 2> ${errPath}`
			.env({...process.env, THREAT_FEED_TOKEN_SERVICE: 'test-service'})
			.quiet();
		// Should have exited non-zero; if we reach here, fail.
		expect(true).toBe(false);
	} catch {
		// Expected: non-zero exit.
	} finally {
		const stderr = await Bun.file(errPath).text();
		expect(stderr).toContain('could not store token');
		expect(stderr).toContain('keychain locked');
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(errPath)
			.delete()
			.catch(() => {});
	}
});

test('--clear-token exits with error when Bun.secrets.delete throws', async () => {
	const scriptPath = `/tmp/scanner-clear-token-throws-${crypto.randomUUID()}.ts`;
	const errPath = `/tmp/scanner-clear-token-throws-err-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		(Bun as unknown as {secrets: unknown}).secrets = {
			get: async () => null,
			set: async () => {},
			delete: async () => {
				throw new Error('libsecret unavailable');
			},
		};
		await import('${srcIndexPath}');
		`,
	);

	try {
		await $`bun run ${scriptPath} --clear-token --threat-feed-token-name my-token 2> ${errPath}`
			.env({...process.env, THREAT_FEED_TOKEN_SERVICE: 'test-service'})
			.quiet();
		// Should have exited non-zero; if we reach here, fail.
		expect(true).toBe(false);
	} catch {
		// Expected: non-zero exit.
	} finally {
		const stderr = await Bun.file(errPath).text();
		expect(stderr).toContain('could not delete token');
		expect(stderr).toContain('libsecret unavailable');
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(errPath)
			.delete()
			.catch(() => {});
	}
});

test('--store-token exits with error when Bun.secrets is undefined', async () => {
	const scriptPath = `/tmp/scanner-store-token-no-api-${crypto.randomUUID()}.ts`;
	const errPath = `/tmp/scanner-store-token-no-api-err-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		(Bun as unknown as {secrets: unknown}).secrets = undefined;
		await import('${srcIndexPath}');
		`,
	);

	try {
		await $`bun run ${scriptPath} --store-token --threat-feed-token-name my-token --store-token-value ghp_test 2> ${errPath}`
			.env({...process.env, THREAT_FEED_TOKEN_SERVICE: 'test-service'})
			.quiet();
		expect(true).toBe(false);
	} catch {
		// Expected: non-zero exit.
	} finally {
		const stderr = await Bun.file(errPath).text();
		expect(stderr).toContain('Bun.secrets is not available');
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(errPath)
			.delete()
			.catch(() => {});
	}
});
