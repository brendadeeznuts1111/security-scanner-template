import {expect, test, beforeEach, afterEach} from 'bun:test';
import {mkdir, rm, writeFile} from 'fs/promises';
import path from 'path';
import os from 'node:os';
import {checkAllDomains} from '../../src/config/doctor.ts';
import {IMPLICIT_OPTIONAL_PEER_CODE} from '../../src/supply-chain/peer-meta.ts';

const TEST_ROOT = path.join(os.tmpdir(), `doctor-peer-meta-${Date.now()}`);

beforeEach(async () => {
	await rm(TEST_ROOT, {recursive: true, force: true});
	await mkdir(`${TEST_ROOT}/domains`, {recursive: true});
	await writeDomain('app', '{ domain: "com.example.app" }');

	const pkgDir = path.join(TEST_ROOT, 'node_modules', 'webpack-cli');
	await mkdir(pkgDir, {recursive: true});
	await writeFile(
		path.join(pkgDir, 'package.json'),
		JSON.stringify({
			name: 'webpack-cli',
			peerDependencies: {webpack: '5.x.x'},
			peerDependenciesMeta: {
				'webpack-dev-server': {optional: true},
			},
		}),
	);
});

afterEach(async () => {
	await rm(TEST_ROOT, {recursive: true, force: true});
});

async function writeDomain(name: string, contents: string): Promise<void> {
	await Bun.write(`${TEST_ROOT}/domains/${name}.security.json5`, contents);
}

test('checkAllDomains includes peerMetaIssues for meta-only optional peers', async () => {
	const result = await checkAllDomains(TEST_ROOT);
	expect(result.peerMetaIssues.some(i => i.code === IMPLICIT_OPTIONAL_PEER_CODE)).toBe(true);
	expect(
		result.peerMetaIssues.some(
			i => i.message.includes('webpack-cli') && i.message.includes('webpack-dev-server'),
		),
	).toBe(true);
});

test('checkAllDomains skips peer meta scan when peerMeta is false', async () => {
	const result = await checkAllDomains(TEST_ROOT, {peerMeta: false});
	expect(result.peerMetaIssues).toHaveLength(0);
});
