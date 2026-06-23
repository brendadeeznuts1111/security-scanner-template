import {statSync} from 'fs';
import path from 'path';
import {resolveBundleIncludePaths} from '../scan/transpiler/bundle-scanner.ts';

const URL_PATTERN = /https?:\/\/[^\s"'`<>\\]+|wss?:\/\/[^\s"'`<>\\]+/gi;
const ROUTE_PATTERN = /(?:['"`])(\/(?:api|v\d|health|status|ready|live|ping|meta)[^\s"'`<>\\]*)/gi;
const HEALTH_ROUTE_PATTERN = /\/(?:healthz?|readyz?|livez?|status|ping|meta)(?:\/[^\s"'`<>\\]*)?/i;

export interface NetworkUrlHit {
	value: string;
	file: string;
	kind: 'url' | 'route';
}

export interface NetworkAuditCounts {
	raw: number;
	unique: number;
	endpoints: string[];
	healthRoutes: string[];
	hits: NetworkUrlHit[];
}

function normalizeEndpoint(value: string): string {
	try {
		if (value.startsWith('http://') || value.startsWith('https://')) {
			const url = new URL(value);
			return `${url.origin}${url.pathname}`.replace(/\/$/, '') || url.origin;
		}
	} catch {
		/* keep literal */
	}
	return value.replace(/\/$/, '') || value;
}

function isHealthRoute(value: string): boolean {
	return HEALTH_ROUTE_PATTERN.test(value);
}

async function collectBundleJsFiles(bundlePath: string): Promise<string[]> {
	const root = path.resolve(bundlePath);
	let stat: ReturnType<typeof statSync>;
	try {
		stat = statSync(root);
	} catch {
		return [];
	}

	if (stat.isFile()) {
		return /\.(js|mjs|cjs)$/i.test(root) ? [root] : [];
	}

	const includes = resolveBundleIncludePaths(root);
	const files: string[] = [];
	const glob = new Bun.Glob('**/*.{js,mjs,cjs}');

	for (const include of includes) {
		const base = path.resolve(root, include === '.' ? '.' : include);
		try {
			if (!statSync(base).isDirectory()) continue;
		} catch {
			continue;
		}
		files.push(...(await scanBundleFilesInDir(base, glob)));
	}

	return files.sort();
}

async function scanBundleFilesInDir(base: string, glob: Bun.Glob): Promise<string[]> {
	const scanned: string[] = [];
	for await (const match of glob.scan({cwd: base, onlyFiles: true})) {
		scanned.push(path.join(base, match));
	}
	return scanned;
}

/** Scan bundle output for network URLs and health-like route literals. */
export async function auditBundleNetwork(bundlePath: string): Promise<NetworkAuditCounts> {
	const files = await collectBundleJsFiles(bundlePath);
	const hits: NetworkUrlHit[] = [];

	for (const file of files) {
		const text = await Bun.file(file).text();
		for (const match of text.matchAll(URL_PATTERN)) {
			const value = match[0]!.replace(/[),;]+$/, '');
			hits.push({value, file, kind: 'url'});
		}
		for (const match of text.matchAll(ROUTE_PATTERN)) {
			const value = match[1]!;
			hits.push({value, file, kind: 'route'});
		}
	}

	const endpointSet = new Set<string>();
	const healthSet = new Set<string>();
	for (const hit of hits) {
		const normalized = normalizeEndpoint(hit.value);
		endpointSet.add(normalized);
		if (isHealthRoute(normalized)) {
			healthSet.add(normalized);
		}
	}

	return {
		raw: hits.length,
		unique: endpointSet.size,
		endpoints: [...endpointSet].sort(),
		healthRoutes: [...healthSet].sort(),
		hits,
	};
}
