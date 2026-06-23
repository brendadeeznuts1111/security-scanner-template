import {expect, test, beforeEach, afterEach} from 'bun:test';
import {mkdir, rm, writeFile} from 'fs/promises';
import path from 'path';
import {applyDefaults} from '../../src/config/defaults.ts';
import {computeBundleSnapshotsParallel} from '../../src/domain/doctor-snapshot-parallel.ts';

const TEST_DIR = `/tmp/bundle-snapshot-parallel-${Date.now()}`;

beforeEach(async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
	await mkdir(TEST_DIR, {recursive: true});
});

afterEach(async () => {
	await rm(TEST_DIR, {recursive: true, force: true});
});

test('computeBundleSnapshotsParallel hashes bundle directories per domain', async () => {
	const distA = path.join(TEST_DIR, 'dist-a');
	const distB = path.join(TEST_DIR, 'dist-b');
	await mkdir(distA, {recursive: true});
	await mkdir(distB, {recursive: true});
	await writeFile(path.join(distA, 'app.js'), 'export const a = 1;');
	await writeFile(path.join(distB, 'app.js'), 'export const b = 2;');

	const configA = applyDefaults({
		domain: 'com.example.parallel-a',
		service: {scan: {transpiler: {enabled: true, includePaths: ['dist-a/']}}},
	});
	const configB = applyDefaults({
		domain: 'com.example.parallel-b',
		service: {scan: {transpiler: {enabled: true, includePaths: ['dist-b/']}}},
	});

	const results = await computeBundleSnapshotsParallel(
		TEST_DIR,
		[
			{domain: 'com.example.parallel-a', config: configA},
			{domain: 'com.example.parallel-b', config: configB},
		],
		{enabled: false},
	);

	expect(results.get('com.example.parallel-a')?.fileCount).toBe(1);
	expect(results.get('com.example.parallel-b')?.fileCount).toBe(1);
	expect(results.get('com.example.parallel-a')?.hash).not.toBe(
		results.get('com.example.parallel-b')?.hash,
	);
});

test('computeBundleSnapshotsParallel can fan out with workers', async () => {
	const jobs = await Promise.all(
		Array.from({length: 4}, async (_, index) => {
			const dir = path.join(TEST_DIR, `dist-${index}`);
			await mkdir(dir, {recursive: true});
			await writeFile(path.join(dir, 'app.js'), `export const v = ${index};`);
			return {
				domain: `com.example.worker-${index}`,
				config: applyDefaults({
					domain: `com.example.worker-${index}`,
					service: {scan: {transpiler: {enabled: true, includePaths: [`dist-${index}/`]}}},
				}),
			};
		}),
	);

	const results = await computeBundleSnapshotsParallel(TEST_DIR, jobs, {
		enabled: true,
		workerCount: 2,
	});

	expect(results.size).toBe(4);
	for (const job of jobs) {
		expect(results.get(job.domain)?.fileCount).toBe(1);
	}
});
