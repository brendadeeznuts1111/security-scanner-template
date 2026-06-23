import {expect, test, beforeEach, afterEach} from 'bun:test';
import {mkdir, rm} from 'fs/promises';
import path from 'path';
import {scanBundle, scanBundles} from '../../src/scan/transpiler.ts';

const TEST_DIR = `/tmp/bundle-scan-test-${Date.now()}`;

beforeEach(async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
	await mkdir(TEST_DIR, {recursive: true});
});

afterEach(async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
});

test('scanBundle detects threats in built JavaScript output', async () => {
	const bundlePath = path.join(TEST_DIR, 'evil-bundle.js');
	await Bun.write(bundlePath, 'export const x = eval("process.env.SECRET");');

	const result = await scanBundle(bundlePath);
	expect(result.bytes).toBeGreaterThan(0);
	expect(result.findings.some(finding => finding.id === 'eval')).toBe(true);
});

test('scanBundle throws when path does not exist', async () => {
	await expect(scanBundle(path.join(TEST_DIR, 'missing.js'))).rejects.toThrow('Bundle not found');
});

test('scanBundles scans multiple bundle files', async () => {
	const clean = path.join(TEST_DIR, 'clean.js');
	const evil = path.join(TEST_DIR, 'evil.js');
	await Bun.write(clean, 'export const ok = 1;');
	await Bun.write(evil, 'export const bad = new Function("return 1")();');

	const results = await scanBundles([clean, evil]);
	expect(results).toHaveLength(2);
	expect(results[0]?.findings.length).toBe(0);
	expect(results[1]?.findings.some(finding => finding.id === 'function-constructor')).toBe(true);
});