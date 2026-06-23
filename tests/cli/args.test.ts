import {expect, test} from 'bun:test';
import {$} from 'bun';
import {setupEnvCleanup, startFeedServer, srcIndexPath} from '../helpers.ts';

setupEnvCleanup();

test('--threat-feed-url overrides the THREAT_FEED_URL env var', async () => {
	const {server: server1, url: url1} = startFeedServer([
		{
			package: 'cli-env-pkg',
			range: '1.0.0',
			url: 'https://example.com/cli-env',
			description: 'From env var',
			categories: ['malware'],
		},
	]);
	const {server: server2, url: url2} = startFeedServer([
		{
			package: 'cli-flag-pkg',
			range: '1.0.0',
			url: 'https://example.com/cli-flag',
			description: 'From CLI flag',
			categories: ['malware'],
		},
	]);

	const scriptPath = `/tmp/scanner-cli-test-${crypto.randomUUID()}.ts`;
	await Bun.write(
		scriptPath,
		`
		import {scanner} from '${srcIndexPath}';
		const advisories = await scanner.scan({
			packages: [{name: 'cli-flag-pkg', version: '1.0.0', requestedRange: '1.0.0', tarball: ''}],
		});
		console.log(JSON.stringify(advisories));
		`,
	);

	try {
		const lines: string[] = [];
		for await (const line of $`bun run ${scriptPath} --threat-feed-url ${url2}`
			.env({...process.env, THREAT_FEED_URL: url1})
			.lines()) {
			if (line.trim().length > 0) lines.push(line);
		}

		const advisories = JSON.parse(lines.at(-1)!);
		expect(advisories).toMatchObject([{package: 'cli-flag-pkg', level: 'fatal'}]);
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
	}

	server1.stop(true);
	server2.stop(true);
});

test('--threat-feed-stdin reads the threat feed from stdin', async () => {
	const feedJson = JSON.stringify({
		rules: [
			{
				package: 'stdin-pkg',
				range: '1.0.0',
				url: 'https://example.com/stdin-pkg',
				description: 'Piped via stdin',
				categories: ['malware'],
			},
		],
	});

	const scriptPath = `/tmp/scanner-stdin-test-${crypto.randomUUID()}.ts`;
	await Bun.write(
		scriptPath,
		`
		import {scanner} from '${srcIndexPath}';
		const advisories = await scanner.scan({
			packages: [{name: 'stdin-pkg', version: '1.0.0', requestedRange: '1.0.0', tarball: ''}],
		});
		console.log(JSON.stringify(advisories));
		`,
	);

	try {
		const lines: string[] = [];
		for await (const line of $`echo ${feedJson} | bun run ${scriptPath} --threat-feed-stdin`.lines()) {
			if (line.trim().length > 0) lines.push(line);
		}

		const advisories = JSON.parse(lines.at(-1)!);
		expect(advisories).toMatchObject([{package: 'stdin-pkg', level: 'fatal'}]);
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
	}
});

test('--console-depth sets console inspection depth', async () => {
	const scriptPath = `/tmp/scanner-console-depth-test-${crypto.randomUUID()}.ts`;
	const outPath = `/tmp/scanner-console-depth-out-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		await import('${srcIndexPath}');
		await Bun.write('${outPath}', JSON.stringify({depth: (console as unknown as {depth?: number}).depth}));
		`,
	);

	try {
		await $`bun run ${scriptPath} --console-depth 4`.quiet();
		const result = JSON.parse(await Bun.file(outPath).text()) as {depth?: number};
		expect(result.depth).toBe(4);
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(outPath)
			.delete()
			.catch(() => {});
	}
});

test('console depth is not changed when --console-depth is omitted', async () => {
	const scriptPath = `/tmp/scanner-console-depth-default-test-${crypto.randomUUID()}.ts`;
	const outPath = `/tmp/scanner-console-depth-default-out-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		await import('${srcIndexPath}');
		await Bun.write('${outPath}', JSON.stringify({depth: (console as unknown as {depth?: number}).depth}));
		`,
	);

	try {
		await $`bun run ${scriptPath}`.quiet();
		const result = JSON.parse(await Bun.file(outPath).text()) as {depth?: number};
		expect(result.depth).toBeUndefined();
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(outPath)
			.delete()
			.catch(() => {});
	}
});

test('--json prints the advisory array to stdout', async () => {
	const scriptPath = `/tmp/scanner-json-test-${crypto.randomUUID()}.ts`;

	await Bun.write(
		scriptPath,
		`
		import {scanner} from '${srcIndexPath}';
		await scanner.scan({
			packages: [{name: 'event-stream', version: '3.3.6', requestedRange: '3.3.6', tarball: ''}],
		});
		`,
	);

	try {
		const stdout = await $`bun run ${scriptPath} --json`.text();
		const advisories = JSON.parse(stdout) as Array<{package: string; level: string}>;
		expect(advisories).toMatchObject([{package: 'event-stream', level: 'fatal'}]);
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
	}
});

test('--dry-run downgrades fatal advisories to warn', async () => {
	const scriptPath = `/tmp/scanner-dry-run-test-${crypto.randomUUID()}.ts`;

	await Bun.write(
		scriptPath,
		`
		import {scanner} from '${srcIndexPath}';
		const advisories = await scanner.scan({
			packages: [{name: 'event-stream', version: '3.3.6', requestedRange: '3.3.6', tarball: ''}],
		});
		console.log(JSON.stringify(advisories));
		`,
	);

	try {
		const stdout = await $`bun run ${scriptPath} --dry-run`.text();
		const advisories = JSON.parse(stdout) as Array<{level: string; package: string}>;
		expect(advisories).toMatchObject([{level: 'warn', package: 'event-stream'}]);
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
	}
});

test('--dry-run notes dry run in scan.complete event', async () => {
	const scriptPath = `/tmp/scanner-dry-run-event-test-${crypto.randomUUID()}.ts`;
	const errPath = `/tmp/scanner-dry-run-event-err-${crypto.randomUUID()}.txt`;

	await Bun.write(
		scriptPath,
		`
		import {scanner} from '${srcIndexPath}';
		await scanner.scan({
			packages: [{name: 'event-stream', version: '3.3.6', requestedRange: '3.3.6', tarball: ''}],
		});
		`,
	);

	try {
		await $`bun run ${scriptPath} --dry-run --scanner-log-stderr 2> ${errPath}`.quiet();
		const stderr = await Bun.file(errPath).text();
		expect(stderr).toContain('scan complete (dry run)');
	} finally {
		await Bun.file(scriptPath)
			.delete()
			.catch(() => {});
		await Bun.file(errPath)
			.delete()
			.catch(() => {});
	}
});
