import {expect, test, beforeEach, afterEach} from 'bun:test';
import {mkdir, rm, writeFile} from 'fs/promises';
import path from 'path';
import os from 'node:os';
import {
	IMPLICIT_OPTIONAL_PEER_CODE,
	checkPeerDependenciesMeta,
	findImplicitOptionalPeerNames,
	issuesForPackageManifest,
} from '../../src/supply-chain/peer-meta.ts';

const TEST_ROOT = path.join(os.tmpdir(), `peer-meta-test-${Date.now()}`);

beforeEach(async () => {
	await rm(TEST_ROOT, {recursive: true, force: true});
	await mkdir(TEST_ROOT, {recursive: true});
});

afterEach(async () => {
	await rm(TEST_ROOT, {recursive: true, force: true});
});

test('findImplicitOptionalPeerNames matches webpack-cli style manifests', () => {
	const implicit = findImplicitOptionalPeerNames({
		peerDependencies: {webpack: '5.x.x'},
		peerDependenciesMeta: {
			'webpack-dev-server': {optional: true},
			'@webpack-cli/generators': {optional: true},
			'webpack-bundle-analyzer': {optional: true},
		},
	});

	expect(implicit).toEqual([
		'webpack-dev-server',
		'@webpack-cli/generators',
		'webpack-bundle-analyzer',
	]);
});

test('findImplicitOptionalPeerNames returns all meta keys when peerDependencies is absent', () => {
	const implicit = findImplicitOptionalPeerNames({
		peerDependenciesMeta: {
			'@webpack-cli/serve': {optional: true},
		},
	});

	expect(implicit).toEqual(['@webpack-cli/serve']);
});

test('issuesForPackageManifest emits IMPLICIT_OPTIONAL_PEER warning', () => {
	const issues = issuesForPackageManifest('webpack-cli', '/tmp/webpack-cli/package.json', {
		peerDependencies: {webpack: '5.x.x'},
		peerDependenciesMeta: {
			'webpack-dev-server': {optional: true},
		},
	});

	expect(issues).toHaveLength(1);
	expect(issues[0]?.code).toBe(IMPLICIT_OPTIONAL_PEER_CODE);
	expect(issues[0]?.severity).toBe('warning');
	expect(issues[0]?.message).toContain('webpack-cli');
	expect(issues[0]?.message).toContain('webpack-dev-server');
});

test('checkPeerDependenciesMeta scans installed packages and reports webpack-cli pattern', async () => {
	const pkgDir = path.join(TEST_ROOT, 'node_modules', 'webpack-cli');
	await mkdir(pkgDir, {recursive: true});
	await writeFile(
		path.join(pkgDir, 'package.json'),
		JSON.stringify({
			name: 'webpack-cli',
			version: '5.1.4',
			peerDependencies: {webpack: '5.x.x'},
			peerDependenciesMeta: {
				'webpack-dev-server': {optional: true},
				'@webpack-cli/generators': {optional: true},
			},
		}),
	);

	const result = await checkPeerDependenciesMeta(TEST_ROOT);
	expect(result.packagesScanned).toBeGreaterThan(0);
	expect(result.warnings).toBe(1);
	expect(result.issues[0]?.code).toBe(IMPLICIT_OPTIONAL_PEER_CODE);
	expect(result.issues[0]?.message).toContain('webpack-dev-server');
});

test('checkPeerDependenciesMeta is ok when node_modules is absent', async () => {
	const emptyRoot = path.join(TEST_ROOT, 'empty-project');
	await mkdir(emptyRoot, {recursive: true});

	const result = await checkPeerDependenciesMeta(emptyRoot);
	expect(result.ok).toBe(true);
	expect(result.issues).toHaveLength(0);
	expect(result.packagesScanned).toBe(0);
});
