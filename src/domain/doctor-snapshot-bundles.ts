import {statSync} from 'fs';
import path from 'path';
import {IntegrityHasher} from '../integrity/hasher.ts';
import {isScannableSourcePath} from '../scan/transpiler/analyzer.ts';
import type {DomainConfig} from '../config/types.ts';
import {resolveTranspilerConfig} from '../scan/transpiler/bundle-scanner.ts';

export interface BundleSnapshot {
	/** Relative path to the bundle directory from project root. */
	path: string;
	/** SHA-256 of sorted per-file digests (concatenated hex). */
	hash: string;
	fileCount: number;
	/** ISO timestamp of the scan. */
	lastScan: string;
}

const SOURCE_GLOB = '**/*.{js,mjs,cjs,ts,tsx,jsx}';

async function collectBundleFiles(base: string): Promise<string[]> {
	let stat: ReturnType<typeof statSync>;
	try {
		stat = statSync(base);
	} catch {
		return [];
	}

	if (stat.isFile() && isScannableSourcePath(base)) {
		return [base];
	}
	if (!stat.isDirectory()) {
		return [];
	}

	const files: string[] = [];
	const glob = new Bun.Glob(SOURCE_GLOB);
	for await (const match of glob.scan({cwd: base, onlyFiles: true})) {
		files.push(path.join(base, match));
	}
	return files.sort();
}

/**
 * Compute bundle aggregate hash for snapshot fingerprinting (spec §16).
 */
export async function computeBundleSnapshot(
	root: string,
	config: DomainConfig,
	hasher: IntegrityHasher = new IntegrityHasher(),
): Promise<BundleSnapshot | null> {
	const transpiler = resolveTranspilerConfig(config);
	if (!transpiler.enabled || transpiler.includePaths.length === 0) {
		return null;
	}

	const bundlePath = transpiler.includePaths[0]!;
	const absolute = path.resolve(root, bundlePath);
	const files = await collectBundleFiles(absolute);
	if (files.length === 0) {
		return null;
	}

	const digests: string[] = [];
	for (const filePath of files) {
		const source = await Bun.file(filePath).text();
		digests.push(hasher.digestSync(source));
	}

	const aggregateHasher = new Bun.CryptoHasher('sha256');
	aggregateHasher.update(digests.join(''));
	const relative = path.relative(root, absolute) || bundlePath;

	return {
		path: relative,
		hash: aggregateHasher.digest('hex'),
		fileCount: files.length,
		lastScan: new Date().toISOString(),
	};
}

/** Build a bundle snapshot for an explicit scan path (CLI `--path`). */
export async function computeBundleSnapshotAtPath(
	root: string,
	scanPath: string,
	hasher: IntegrityHasher = new IntegrityHasher(),
): Promise<BundleSnapshot | null> {
	const absolute = path.resolve(root, scanPath);
	const files = await collectBundleFiles(absolute);
	if (files.length === 0) {
		return null;
	}

	const digests: string[] = [];
	for (const filePath of files) {
		digests.push(hasher.digestSync(await Bun.file(filePath).text()));
	}

	const aggregateHasher = new Bun.CryptoHasher('sha256');
	aggregateHasher.update(digests.join(''));

	return {
		path: path.relative(root, absolute) || scanPath,
		hash: aggregateHasher.digest('hex'),
		fileCount: files.length,
		lastScan: new Date().toISOString(),
	};
}