import {expect, test, beforeEach} from 'bun:test';
import {
	createProvider,
	scanner,
	scannerCapabilities,
	resetPolicy,
} from '../../src/provider/index.ts';
import {packageFixture, startFeedServer} from '../helpers.ts';

beforeEach(() => {
	resetPolicy();
});

test('Provider should scan packages against default rules', async () => {
	const provider = createProvider({config: {}});
	const advisories = await provider.scan({
		packages: [packageFixture('event-stream', '3.3.6', '^3.3.0')],
	});

	expect(advisories.length).toBeGreaterThan(0);
	expect(advisories[0]).toMatchObject({
		level: 'fatal',
		package: 'event-stream',
	});
});

test('Provider should load a remote threat feed', async () => {
	const {server, url} = startFeedServer([
		{
			package: 'remote-pkg',
			range: '1.0.0',
			url: 'https://example.com/remote-pkg',
			description: 'Malicious remote package',
			categories: ['malware'],
		},
	]);

	const provider = createProvider({config: {remote: url, cacheTtl: 0}});
	const advisories = await provider.scan({
		packages: [packageFixture('remote-pkg', '1.0.0')],
	});

	expect(advisories).toMatchObject([
		{
			level: 'fatal',
			package: 'remote-pkg',
			url: 'https://example.com/remote-pkg',
			description: 'Malicious remote package',
		},
	]);

	server.stop(true);
});

test('Provider should respect custom severity policy', async () => {
	const provider = createProvider({
		config: {},
		policy: {
			fatal: ['malware'],
			warn: ['deprecated'],
		},
	});

	const advisories = await provider.scan({
		packages: [packageFixture('deprecated-example', '1.0.0')],
	});

	expect(advisories).toMatchObject([{level: 'warn', package: 'deprecated-example'}]);
});

test('Provider should warn about protestware', async () => {
	const {server, url} = startFeedServer([
		{
			package: 'protest-pkg',
			range: '1.0.0',
			url: 'https://example.com/protest-pkg',
			description: 'Protestware',
			categories: ['protestware'],
		},
	]);

	const provider = createProvider({config: {remote: url, cacheTtl: 0}});
	const advisories = await provider.scan({
		packages: [packageFixture('protest-pkg', '1.0.0')],
	});

	expect(advisories).toMatchObject([{level: 'warn', package: 'protest-pkg'}]);

	server.stop(true);
});

test('Provider should expose capabilities', () => {
	expect(scannerCapabilities).toMatchObject({
		version: '1.0.0',
		apiVersion: '1',
		supports: expect.arrayContaining(['remote-threat-feed', 'local-threat-feed', 'zod-validation']),
		categories: expect.arrayContaining(['malware', 'backdoor', 'protestware']),
	});
});

test('Default scanner should detect known malicious package', async () => {
	const advisories = await scanner.scan({
		packages: [packageFixture('event-stream', '3.3.6')],
	});

	expect(advisories.length).toBeGreaterThan(0);
	expect(advisories[0]?.package).toBe('event-stream');
});

test('Provider should downgrade fatal advisories in dry-run mode', async () => {
	const {server, url} = startFeedServer([
		{
			package: 'dry-run-pkg',
			range: '1.0.0',
			url: 'https://example.com/dry-run-pkg',
			description: 'Would be fatal',
			categories: ['malware'],
		},
	]);

	const provider = createProvider({config: {remote: url, cacheTtl: 0}, dryRun: true});
	const advisories = await provider.scan({
		packages: [packageFixture('dry-run-pkg', '1.0.0')],
	});

	expect(advisories).toMatchObject([
		{
			level: 'warn',
			package: 'dry-run-pkg',
			description: '[DRY RUN] Would block: Would be fatal',
		},
	]);

	server.stop(true);
});

test('Provider should cache remote feed within TTL', async () => {
	let calls = 0;
	const server = Bun.serve({
		port: 0,
		fetch: () => {
			calls++;
			return new Response(
				JSON.stringify([
					{
						package: 'cached-pkg',
						range: '1.0.0',
						categories: ['malware'],
						url: null,
						description: null,
					},
				]),
				{headers: {'Content-Type': 'application/json'}},
			);
		},
	});
	const url = `http://localhost:${server.port}`;

	const provider = createProvider({config: {remote: url, cacheTtl: 60}});
	await provider.scan({packages: [packageFixture('cached-pkg', '1.0.0')]});
	await provider.scan({packages: [packageFixture('cached-pkg', '1.0.0')]});

	expect(calls).toBe(1);

	server.stop(true);
});

test('Provider should apply policy document overrides', async () => {
	const {server, url} = startFeedServer([
		{
			package: 'ignored-pkg',
			range: '1.0.0',
			url: 'https://example.com/ignored-pkg',
			description: 'Ignored by policy',
			categories: ['malware'],
		},
	]);

	const provider = createProvider({
		config: {remote: url, cacheTtl: 0},
		policyDocument: {
			override: [{package: 'ignored-pkg', action: 'ignore', reason: 'Trusted'}],
		},
	});
	const advisories = await provider.scan({
		packages: [packageFixture('ignored-pkg', '1.0.0')],
	});

	expect(advisories.length).toBe(0);

	server.stop(true);
});
