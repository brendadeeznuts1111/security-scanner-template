import {expect, test} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {checkDomainsParallel} from '../../src/scan/domain-parallel.ts';

function loaded(domain: string, patch: Record<string, unknown> = {}) {
	return {
		domain,
		path: `/tmp/${domain}.security.json5`,
		config: applyDefaults({domain, ...patch}),
	};
}

test('checkDomainsParallel validates multiple domains', async () => {
	const results = await checkDomainsParallel(
		[loaded('com.example.a'), loaded('com.example.b', {colors: {primary: 'bad'}})],
		{enabled: false},
	);

	expect(results).toHaveLength(2);
	expect(results[0]?.ok).toBe(true);
	expect(results[1]?.ok).toBe(false);
});

test('checkDomainsParallel can fan out with workers', async () => {
	const domains = Array.from({length: 4}, (_, i) => loaded(`com.example.worker-${i}`));
	const results = await checkDomainsParallel(domains, {enabled: true, workerCount: 2});
	expect(results).toHaveLength(4);
	expect(results.every(result => result.ok)).toBe(true);
});
