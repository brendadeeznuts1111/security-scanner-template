import {describe, expect, test} from 'bun:test';
import {mergeEndpointProbeTargets} from '../../src/policy/endpoints.ts';
import {loadPolicy, DEFAULT_POLICY_FILE} from '../../src/policy/loader.ts';
import {withTestDir, writeFileInDir} from '../helpers.ts';

describe('mergeEndpointProbeTargets', () => {
test('dedupes by method and url', () => {
	const merged = mergeEndpointProbeTargets(
		[{url: 'http://a/meta', method: 'GET'}],
		[{url: 'http://a/meta', label: 'dup'}],
		[{url: 'http://b/health', method: 'HEAD'}],
	);
	expect(merged).toHaveLength(2);
	expect(merged[0]?.url).toBe('http://a/meta');
});
});

describe('loadPolicy intel.endpoints', () => {
test('parses intel.endpoints section', async () => {
	await withTestDir('policy-endpoints', async root => {
		await writeFileInDir(
			root,
			DEFAULT_POLICY_FILE,
			`
[[intel.endpoints]]
url = "http://127.0.0.1:8080/meta"
label = "meta"
expectStatus = 200
`,
		);

		const doc = await loadPolicy(`${root}/${DEFAULT_POLICY_FILE}`);
		expect(doc.intel?.endpoints?.[0]?.url).toContain('/meta');
	});
});
});