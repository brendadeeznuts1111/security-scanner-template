import path from 'path';
import {extractPackageMetadata} from '../config/package-metadata.ts';

/** Resolve the running scanner semver from project package.json. */
export async function resolveScannerVersion(root: string = process.cwd()): Promise<string> {
	const meta = await extractPackageMetadata(path.join(root, 'package.json'));
	return meta?.version || '0.0.0';
}