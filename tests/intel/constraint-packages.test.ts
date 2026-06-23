import {expect, test} from 'bun:test';
import {mkdir, rm, writeFile} from 'fs/promises';
import path from 'path';
import {
	discoverWorkspacePackageRoots,
	listAllInstalledPackages,
	readAllProjectDependencySpecifiers,
	readInstalledPackageLicense,
	resolveInstalledPackageJsonPath,
} from '../../src/intel/constraint-packages.ts';

const TEST_DIR = `/tmp/constraint-packages-${Date.now()}`;

async function write(relative: string, content: string): Promise<void> {
	const target = path.join(TEST_DIR, relative);
	await mkdir(path.dirname(target), {recursive: true});
	await writeFile(target, content);
}

test('resolveInstalledPackageJsonPath supports scoped packages', () => {
	expect(resolveInstalledPackageJsonPath('/proj', '@acme/utils')).toBe(
		path.join('/proj', 'node_modules', '@acme', 'utils', 'package.json'),
	);
});

test('readInstalledPackageLicense reads nested node_modules installDir', async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
	await write(
		'node_modules/.store/gpl-lib/package.json',
		JSON.stringify({name: 'gpl-lib', version: '1.0.0', license: 'GPL-3.0'}),
	);

	const license = await readInstalledPackageLicense(
		TEST_DIR,
		'gpl-lib',
		'node_modules/.store/gpl-lib',
	);
	expect(license).toBe('GPL-3.0');
	await rm(TEST_DIR, {recursive: true, force: true});
});

test('readAllProjectDependencySpecifiers merges workspace package.json deps', async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
	await write(
		'package.json',
		JSON.stringify({
			workspaces: ['packages/*'],
			dependencies: {rootpkg: '1.0.0'},
		}),
	);
	await write(
		'packages/app/package.json',
		JSON.stringify({
			dependencies: {'evil-pkg': 'git+https://example.com/evil'},
		}),
	);

	const roots = await discoverWorkspacePackageRoots(TEST_DIR);
	expect(roots).toContain('packages/app');

	const specs = await readAllProjectDependencySpecifiers(TEST_DIR);
	expect(specs.some(s => s.name === 'rootpkg')).toBe(true);
	expect(specs.some(s => s.name === 'evil-pkg' && s.workspace === 'packages/app')).toBe(true);
	await rm(TEST_DIR, {recursive: true, force: true});
});

test('listAllInstalledPackages records shallowest installDir per package', async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
	await write('node_modules/alpha/package.json', JSON.stringify({name: 'alpha', version: '1.0.0'}));
	await write(
		'node_modules/nested/node_modules/alpha/package.json',
		JSON.stringify({name: 'alpha', version: '9.9.9'}),
	);

	const packages = await listAllInstalledPackages(TEST_DIR);
	const alpha = packages.find(pkg => pkg.name === 'alpha');
	expect(alpha?.version).toBe('1.0.0');
	expect(alpha?.installDir).toBe('node_modules/alpha');
	await rm(TEST_DIR, {recursive: true, force: true});
});
