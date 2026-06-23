import {expect, test} from 'bun:test';
import {mergeEndpointProbeTargets} from '../../src/policy/endpoints.ts';
import {loadPolicy, DEFAULT_POLICY_FILE} from '../../src/policy/loader.ts';
import {mkdir, rm, writeFile} from 'fs/promises';
import path from 'path';

const TEST_DIR = `/tmp/policy-endpoints-${Date.now()}`;

test('merged endpoint probe targets dedupe by method and url', () => {
	const merged = mergeEndpointProbeTargets(
		[{url: 'http://a/meta', method: 'GET'}],
		[{url: 'http://a/meta', label: 'dup'}],
		[{url: 'http://b/health', method: 'HEAD'}],
	);
	expect(merged).toHaveLength(2);
	expect(merged[0]?.url).toBe('http://a/meta');
});

test('policy loader parses intel.endpoints section', async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
	await mkdir(TEST_DIR, {recursive: true});
	await writeFile(
		path.join(TEST_DIR, DEFAULT_POLICY_FILE),
		`
[[intel.endpoints]]
url = "http://127.0.0.1:8080/meta"
label = "meta"
expectStatus = 200
`,
	);

	const doc = await loadPolicy(path.join(TEST_DIR, DEFAULT_POLICY_FILE));
	expect(doc.intel?.endpoints?.[0]?.url).toContain('/meta');
	await rm(TEST_DIR, {recursive: true, force: true});
});