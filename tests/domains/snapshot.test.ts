import {expect, test, beforeEach, afterEach} from 'bun:test';
import {loadPackageSnapshot, toSecurityPackage} from '../../src/domains/snapshot.ts';

const TEST_DIR = `/tmp/snapshot-test-${Date.now()}`;

beforeEach(async () => {
	await Bun.write(TEST_DIR, '').catch(() => {});
	const {rm, mkdir} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
	await mkdir(TEST_DIR, {recursive: true});
});

afterEach(async () => {
	const {rm} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
});

test('loadPackageSnapshot reads dependencies from package.json', async () => {
	await Bun.write(
		`${TEST_DIR}/package.json`,
		JSON.stringify({
			dependencies: {lodash: '^4.17.21'},
			devDependencies: {prettier: '^3.0.0'},
		}),
	);

	const snapshots = await loadPackageSnapshot(`${TEST_DIR}/package.json`);
	expect(snapshots.length).toBe(2);
	expect(snapshots.find(s => s.name === 'lodash')?.version).toBe('4.17.21');
	expect(snapshots.find(s => s.name === 'prettier')?.version).toBe('3.0.0');
});

test('loadPackageSnapshot returns empty array when package.json is missing', async () => {
	const snapshots = await loadPackageSnapshot(`${TEST_DIR}/missing.json`);
	expect(snapshots.length).toBe(0);
});

test('toSecurityPackage converts snapshot to Bun.Security.Package', () => {
	const pkg = toSecurityPackage({name: 'lodash', version: '4.17.21', requestedRange: '^4.17.21'});
	expect(pkg.name).toBe('lodash');
	expect(pkg.version).toBe('4.17.21');
	expect(pkg.requestedRange).toBe('^4.17.21');
	expect(pkg.tarball).toBe('');
});
