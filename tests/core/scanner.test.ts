import {expect, test} from 'bun:test';
import {scanner, scannerCapabilities} from '../../src/index.ts';
import {setupEnvCleanup, startFeedServer, packageFixture} from '../helpers.ts';

setupEnvCleanup();

test('Scanner should warn about known malicious packages', async () => {
	const advisories = await scanner.scan({
		packages: [
			packageFixture(
				'event-stream',
				'3.3.6', // This was a known incident in 2018 - https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident
				'^3.3.0',
			),
		],
	});

	expect(advisories.length).toBeGreaterThan(0);
	const advisory = advisories[0]!;
	expect(advisory).toBeDefined();

	expect(advisory).toMatchObject({
		level: 'fatal',
		package: 'event-stream',
		url: expect.any(String),
		description: expect.any(String),
	});
});

test('There should be no advisories if no packages are being installed', async () => {
	const advisories = await scanner.scan({packages: []});
	expect(advisories.length).toBe(0);
});

test('Safe packages should return no advisories', async () => {
	const advisories = await scanner.scan({
		packages: [packageFixture('lodash', '4.17.21', '^4.17.0')],
	});
	expect(advisories.length).toBe(0);
});

test('Should handle multiple packages with mixed security status', async () => {
	const advisories = await scanner.scan({
		packages: [
			packageFixture('event-stream', '3.3.6', '^3.3.0'), // malicious
			packageFixture('lodash', '4.17.21', '^4.17.0'), // safe
		],
	});

	expect(advisories.length).toBe(1);
	expect(advisories[0]?.package).toBe('event-stream');
});

test('Should differentiate between versions of the same package', async () => {
	const maliciousVersion = await scanner.scan({
		packages: [packageFixture('event-stream', '3.3.6', '3.3.6')],
	});

	const safeVersion = await scanner.scan({
		packages: [packageFixture('event-stream', '4.0.0', '4.0.0')],
	});

	expect(maliciousVersion.length).toBeGreaterThan(0);
	expect(safeVersion.length).toBe(0);
});

test('Should handle scoped packages correctly', async () => {
	const advisories = await scanner.scan({
		packages: [packageFixture('@types/node', '20.0.0', '^20.0.0')],
	});

	expect(advisories.length).toBe(0);
});

test('Should warn about protestware and adware', async () => {
	const {server, url} = startFeedServer([
		{
			package: 'protest-pkg',
			range: '1.0.0',
			url: 'https://example.com/protest-pkg',
			description: 'Protestware',
			categories: ['protestware'],
		},
		{
			package: 'adware-pkg',
			range: '>=2.0.0 <3.0.0',
			url: 'https://example.com/adware-pkg',
			description: 'Adware',
			categories: ['adware'],
		},
	]);
	process.env.THREAT_FEED_URL = url;

	const protestware = await scanner.scan({
		packages: [packageFixture('protest-pkg', '1.0.0')],
	});
	const adware = await scanner.scan({
		packages: [packageFixture('adware-pkg', '2.5.0', '^2.0.0')],
	});

	expect(protestware).toMatchObject([{level: 'warn', package: 'protest-pkg'}]);
	expect(adware).toMatchObject([{level: 'warn', package: 'adware-pkg'}]);

	server.stop(true);
});

test('Should warn about deprecated packages', async () => {
	const {server, url} = startFeedServer([
		{
			package: 'deprecated-pkg',
			range: '<=2.0.0',
			url: 'https://example.com/deprecated-pkg',
			description: 'This package is deprecated',
			categories: ['deprecated'],
		},
	]);
	process.env.THREAT_FEED_URL = url;

	const advisories = await scanner.scan({
		packages: [packageFixture('deprecated-pkg', '1.5.0', '^1.0.0')],
	});

	expect(advisories).toMatchObject([
		{
			level: 'warn',
			package: 'deprecated-pkg',
			url: 'https://example.com/deprecated-pkg',
			description: 'This package is deprecated',
		},
	]);

	server.stop(true);
});

test('Should ignore unknown threat categories', async () => {
	const {server, url} = startFeedServer([
		{
			package: 'unknown-cat-pkg',
			range: '1.0.0',
			url: null,
			description: null,
			categories: ['protestware', 'adware', 'backdoor', 'malware', 'botnet'],
		},
	]);
	process.env.THREAT_FEED_URL = url;

	const advisories = await scanner.scan({
		packages: [packageFixture('unknown-cat-pkg', '1.0.0')],
	});

	expect(advisories.length).toBe(1);
	expect(advisories[0]?.level).toBe('fatal');

	server.stop(true);
});

test('Should expose scanner capabilities', () => {
	expect(scannerCapabilities).toMatchObject({
		version: '1.0.0',
		apiVersion: '1',
		supports: expect.arrayContaining([
			'remote-threat-feed',
			'local-threat-feed',
			'stdin-threat-feed',
			'tarball-hash-verification',
			'timeout-and-retry',
			'zod-validation',
			'allowlist-policy',
			'structured-event-emission',
		]),
		categories: expect.arrayContaining(['protestware', 'adware', 'backdoor', 'malware', 'botnet']),
	});
});

test('Should load default rules from rules/security-rules.json', async () => {
	const rules = await Bun.file('./rules/security-rules.json').json();
	const eventStreamRule = rules.find((rule: any) => rule.package === 'event-stream');
	expect(eventStreamRule).toBeDefined();

	const advisories = await scanner.scan({
		packages: [packageFixture('event-stream', '3.3.6', '^3.3.0')],
	});

	expect(advisories).toMatchObject([
		{
			level: 'fatal',
			package: eventStreamRule.package,
			url: eventStreamRule.url,
			description: eventStreamRule.description,
		},
	]);
});

test('Should suppress threats for packages on the allowlist', async () => {
	const {server, url} = startFeedServer({
		rules: [
			{
				package: 'allowed-pkg',
				range: '1.0.0',
				url: 'https://example.com/allowed-pkg',
				description: 'Normally blocked',
				categories: ['malware'],
			},
		],
		allowlist: [{package: 'allowed-pkg', range: '1.0.0', reason: 'approved exception'}],
	});
	process.env.THREAT_FEED_URL = url;

	const advisories = await scanner.scan({
		packages: [packageFixture('allowed-pkg', '1.0.0')],
	});

	expect(advisories.length).toBe(0);

	server.stop(true);
});

test('Should not suppress non-allowlisted versions of an allowlisted package', async () => {
	const {server, url} = startFeedServer({
		rules: [
			{
				package: 'allowed-pkg',
				range: '<=2.0.0',
				url: 'https://example.com/allowed-pkg',
				description: 'Normally blocked',
				categories: ['malware'],
			},
		],
		allowlist: [{package: 'allowed-pkg', range: '1.0.0'}],
	});
	process.env.THREAT_FEED_URL = url;

	const allowed = await scanner.scan({
		packages: [packageFixture('allowed-pkg', '1.0.0')],
	});
	const blocked = await scanner.scan({
		packages: [packageFixture('allowed-pkg', '2.0.0')],
	});

	expect(allowed.length).toBe(0);
	expect(blocked).toMatchObject([{level: 'fatal', package: 'allowed-pkg'}]);

	server.stop(true);
});
