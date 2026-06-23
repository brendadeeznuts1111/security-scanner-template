import {expect, test, beforeEach, afterEach} from 'bun:test';
import {extractPackageMetadata} from '../../src/config/package-metadata.ts';

const TEST_DIR = `/tmp/package-metadata-test-${Date.now()}`;
const PKG_PATH = `${TEST_DIR}/package.json`;

beforeEach(async () => {
	await Bun.write(
		PKG_PATH,
		JSON.stringify({
			name: '@acme/snapshot-test',
			version: '2.0.0',
			description: 'metadata extraction test',
			license: 'MIT',
			engines: {bun: '>=1.3.14'},
			dependencies: {zod: '^3.0.0'},
			devDependencies: {'bun-types': '1.3.14'},
		}),
	);
});

afterEach(async () => {
	const {rm} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
});

test('extractPackageMetadata reads name, engines, and dependency counts', async () => {
	const meta = await extractPackageMetadata(PKG_PATH);
	expect(meta).not.toBeNull();
	expect(meta?.name).toBe('@acme/snapshot-test');
	expect(meta?.version).toBe('2.0.0');
	expect(meta?.bunEngine).toBe('>=1.3.14');
	expect(meta?.dependencyCount).toBe(1);
	expect(meta?.devDependencyCount).toBe(1);
	expect(meta?.fileSize).toBeGreaterThan(0);
});
