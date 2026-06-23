import {expect, test, beforeEach} from 'bun:test';
import {createProvider, resetPolicy} from '../../src/provider/index.ts';
import {packageFixture, startFeedServer} from '../helpers.ts';

beforeEach(() => {
	resetPolicy();
});

test('provider scans package sources with Bun.Transpiler', async () => {
	const provider = createProvider({config: {}});
	const advisories = await provider.scan({
		packages: [packageFixture('source-pkg', '1.0.0')],
		extensions: {
			sources: {
				'source-pkg': 'const payload = eval(globalThis.secret);',
			},
		},
	});

	expect(advisories.some(advisory => advisory.package === 'source-pkg')).toBe(true);
	expect(advisories[0]?.level).toBe('fatal');
});

test('provider uses parallel worker scan for large trees', async () => {
	const {server, url} = startFeedServer(
		Array.from({length: 3}, (_, index) => ({
			package: `parallel-pkg-${index}`,
			range: '1.0.0',
			url: null,
			description: `Parallel ${index}`,
			categories: ['malware'],
		})),
	);

	const provider = createProvider({config: {remote: url, cacheTtl: 0}});
	const packages = Array.from({length: 10}, (_, index) =>
		packageFixture(`parallel-pkg-${index % 3}`, '1.0.0', `dep-${index}`),
	);

	const advisories = await provider.scan({
		packages,
		extensions: {parallel: {enabled: true, workerCount: 2}},
	});

	expect(advisories.length).toBeGreaterThan(0);
	server.stop(true);
});
