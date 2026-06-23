import {expect, test} from 'bun:test';
import {scanner} from '../../src/index.ts';
import {setupEnvCleanup, startFeedServer, startTarballServer, sha256Hex} from '../helpers.ts';

setupEnvCleanup();

test('block packages by tarball hash', async () => {
	const tarballContents = 'mock tarball contents';
	const blockedHash = await sha256Hex(tarballContents);

	const {server: tarballServer, url: tarballUrl} = startTarballServer(tarballContents);
	const {server: feedServer, url: feedUrl} = startFeedServer([
		{
			package: 'hashed-pkg',
			range: '1.0.0',
			url: 'https://example.com/hashed-pkg',
			description: 'Package with known bad hash',
			categories: ['malware'],
			hashes: [blockedHash],
		},
	]);
	process.env.THREAT_FEED_URL = feedUrl;

	const advisories = await scanner.scan({
		packages: [
			{
				name: 'hashed-pkg',
				version: '1.0.0',
				requestedRange: '1.0.0',
				tarball: tarballUrl,
			},
		],
	});

	expect(advisories).toMatchObject([
		{
			level: 'fatal',
			package: 'hashed-pkg',
		},
	]);

	tarballServer.stop(true);
	feedServer.stop(true);
});

test('ignore threats when tarball hash does not match blocklist', async () => {
	const tarballContents = 'safe tarball contents';
	const {server: tarballServer, url: tarballUrl} = startTarballServer(tarballContents);
	const {server: feedServer, url: feedUrl} = startFeedServer([
		{
			package: 'safe-hashed-pkg',
			range: '1.0.0',
			url: 'https://example.com/safe-hashed-pkg',
			description: 'Package with known bad hash',
			categories: ['malware'],
			hashes: ['0000000000000000000000000000000000000000000000000000000000000000'],
		},
	]);
	process.env.THREAT_FEED_URL = feedUrl;

	const advisories = await scanner.scan({
		packages: [
			{
				name: 'safe-hashed-pkg',
				version: '1.0.0',
				requestedRange: '1.0.0',
				tarball: tarballUrl,
			},
		],
	});

	expect(advisories.length).toBe(0);

	tarballServer.stop(true);
	feedServer.stop(true);
});
