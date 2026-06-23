import {existsSync, statSync} from 'fs';
import path from 'path';

/** Resolve a user-supplied scan path (supports monorepo-style relative paths). */
export function resolveSupplyChainScanPath(rawPath: string): string {
	const direct = path.resolve(rawPath);
	if (existsSync(direct)) {
		return direct;
	}
	const home = process.env.HOME ?? '';
	const candidates = [
		path.resolve(process.cwd(), rawPath),
		path.resolve(process.cwd(), '..', rawPath),
		path.resolve(home, 'Projects', rawPath),
		path.resolve(home, 'Projects', 'projects', rawPath),
	];
	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return direct;
}

/** Walk upward from a bundle path to the nearest directory containing package.json. */
export function resolveProjectRootFromPath(scanPath: string): string | null {
	let current = path.resolve(scanPath);
	try {
		const stat = statSync(current);
		if (stat.isFile()) {
			current = path.dirname(current);
		}
	} catch {
		return null;
	}

	while (true) {
		if (existsSync(path.join(current, 'package.json'))) {
			return current;
		}
		const parent = path.dirname(current);
		if (parent === current) {
			return null;
		}
		current = parent;
	}
}