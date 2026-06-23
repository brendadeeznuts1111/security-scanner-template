import {expect, test, beforeEach, afterEach} from 'bun:test';
import {mkdirSync, mkdtempSync, writeFileSync} from 'fs';
import path from 'path';
import {tmpdir} from 'os';
import {resolveSupplyChainWatchPaths} from '../../src/cli/supply-chain-watch.ts';

let testRoot = '';

beforeEach(() => {
	testRoot = mkdtempSync(path.join(tmpdir(), 'sc-watch-'));
	const distDir = path.join(testRoot, 'dist');
	mkdirSync(distDir, {recursive: true});
	writeFileSync(path.join(testRoot, 'package.json'), '{"name":"fixture","dependencies":{}}\n');
	writeFileSync(path.join(testRoot, 'bun.lock'), '{"lockfileVersion":1}\n');
	writeFileSync(path.join(distDir, 'index.js'), 'export {};\n');
	writeFileSync(path.join(testRoot, 'security.policy.toml'), '[policy.default]\nfatal = ["malware"]\n');
});

afterEach(() => {
	/* temp dirs cleaned by OS */
});

test('supply chain watch resolves bundle, lockfile, and policy paths', () => {
	const paths = resolveSupplyChainWatchPaths({
		path: path.join(testRoot, 'dist'),
	});
	expect(paths.some(filePath => filePath.endsWith('index.js'))).toBe(true);
	expect(paths.some(filePath => filePath.endsWith('bun.lock'))).toBe(true);
	expect(paths.some(filePath => filePath.endsWith('security.policy.toml'))).toBe(true);
});