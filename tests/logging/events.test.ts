import {expect, test} from 'bun:test';
import {scanner} from '../../src/index.ts';
import {setupEnvCleanup, startFeedServer, packageFixture, readLines} from '../helpers.ts';

setupEnvCleanup();

test('emit structured events to a log file', async () => {
	const logPath = `/tmp/scanner-events-${crypto.randomUUID()}.log`;
	process.env.SCANNER_LOG_PATH = logPath;

	const {server, url} = startFeedServer({
		rules: [
			{
				package: 'logged-pkg',
				range: '1.0.0',
				url: 'https://example.com/logged-pkg',
				description: 'Blocked for logging test',
				categories: ['malware'],
			},
		],
		allowlist: [{package: 'allowed-pkg', range: '1.0.0', reason: 'exception'}],
	});
	process.env.THREAT_FEED_URL = url;

	await scanner.scan({
		packages: [packageFixture('logged-pkg', '1.0.0'), packageFixture('allowed-pkg', '1.0.0')],
	});

	const lines = await readLines(logPath);
	expect(lines.length).toBeGreaterThanOrEqual(1);

	const events = lines.map(line => JSON.parse(line));
	expect(events).toEqual(
		expect.arrayContaining([
			expect.objectContaining({type: 'scan.start', packageCount: 2}),
			expect.objectContaining({
				type: 'feed.loaded',
				source: 'remote',
				ruleCount: 1,
				allowlistCount: 1,
			}),
			expect.objectContaining({
				type: 'threat.allowed',
				package: 'allowed-pkg',
				reason: 'exception',
			}),
			expect.objectContaining({type: 'threat.detected', level: 'fatal', package: 'logged-pkg'}),
			expect.objectContaining({type: 'scan.complete', advisoryCount: 1, allowedCount: 1}),
		]),
	);

	// scan.complete must be the final event so log consumers can detect the end of a scan.
	expect(events.at(-1)?.type).toBe('scan.complete');

	server.stop(true);
	await Bun.file(logPath)
		.delete()
		.catch(() => {});
});
