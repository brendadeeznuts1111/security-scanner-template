import path from 'path';
import {mkdir} from 'fs/promises';
import {DEFAULT_MASTER_KEY_NAME} from '../config/master-key.ts';
import {isReverseDnsDomain, reverseDnsPathSegment} from '../domain/branding.ts';
import {QRGenerator, type QRGenerateOptions} from './qr.ts';

/** Bun.secrets name for the domain master token encoded in operator QR codes. */
export const MASTER_TOKEN_SECRET = DEFAULT_MASTER_KEY_NAME;

/** Legacy secret name kept for backward-compatible QR lookups. */
export const LEGACY_MASTER_TOKEN_SECRET = '__master_token';

const MAPPING_FILE = 'mapping.json';

/**
 * Directory for cached domain QR PNGs (`~/.bun/security-scanner/qr-cache`).
 * Override with `QR_CACHE_DIR` in tests.
 */
export function qrCacheDir(): string {
	if (process.env.QR_CACHE_DIR) {
		return path.resolve(process.env.QR_CACHE_DIR);
	}

	const home = process.env.HOME;
	if (home) {
		return path.join(home, '.bun', 'security-scanner', 'qr-cache');
	}

	return path.join(process.cwd(), '.security', 'qr-cache');
}

export interface QrCacheKeyPair {
	/** Lowercase hex cache key from Bun.hash. */
	key: string;
	/** Uppercase hex cache key. */
	HEX: string;
}

export interface QrCacheMapping {
	/** Reverse-DNS domain id (e.g. com.factory-wager.ledger). */
	domain: string;
	/** Bun.secrets service name (usually same as domain). */
	serviceName: string;
	/** Bun.secrets secret name for the master token. */
	secretName: string;
	/** Hash input — never logged with token value. */
	hashInput: `${string}:${string}`;
	key: string;
	HEX: string;
	/** Absolute PNG path under the reverse-DNS segment. */
	path: string;
	updatedAt: string;
}

export interface QrCacheIndex {
	byDomain: Record<string, QrCacheMapping>;
	byKey: Record<string, QrCacheMapping>;
}

/**
 * Stable cache key pair from reverse-DNS domain + token using Bun.hash.
 */
export function qrCacheKeyPair(domain: string, token: string): QrCacheKeyPair {
	const key = Bun.hash(`${domain}:${token}`).toString(16);
	return {key, HEX: key.toUpperCase()};
}

/** @deprecated Use {@link qrCacheKeyPair}. */
export function qrCacheKey(domain: string, token: string): string {
	return qrCacheKeyPair(domain, token).key;
}

export function qrCacheDomainDir(domain: string, root = qrCacheDir()): string {
	return path.join(root, reverseDnsPathSegment(domain));
}

export function qrCachePath(
	domain: string,
	token: string,
	root = qrCacheDir(),
): string {
	const {key} = qrCacheKeyPair(domain, token);
	return path.join(qrCacheDomainDir(domain, root), `${key}.png`);
}

export function qrCacheMappingPath(domain: string, root = qrCacheDir()): string {
	return path.join(qrCacheDomainDir(domain, root), MAPPING_FILE);
}

/**
 * Build a full cache mapping for a reverse-DNS domain and master token.
 */
export function buildQrCacheMapping(
	domain: string,
	token: string,
	serviceName: string,
	secretName = MASTER_TOKEN_SECRET,
	root = qrCacheDir(),
): QrCacheMapping {
	if (!isReverseDnsDomain(domain)) {
		throw new Error(`domain must be a valid reverse-DNS identifier: ${domain}`);
	}

	const {key, HEX} = qrCacheKeyPair(domain, token);
	const filePath = path.join(qrCacheDomainDir(domain, root), `${key}.png`);

	return {
		domain,
		serviceName,
		secretName,
		hashInput: `${domain}:*`,
		key,
		HEX,
		path: filePath,
		updatedAt: new Date().toISOString(),
	};
}

/**
 * One-line operator log for QR cache mapping (hex + HEX + reverse-DNS).
 */
export function formatQrCacheMappingLog(mapping: QrCacheMapping, fromCache: boolean): string {
	const action = fromCache ? 'cache-hit' : 'cache-write';
	return (
		`[sp] qr map ${action} ` +
		`domain=${mapping.domain} ` +
		`service=${mapping.serviceName} ` +
		`secret=${mapping.secretName} ` +
		`key=${mapping.key} ` +
		`HEX=${mapping.HEX} ` +
		`path=${mapping.path}`
	);
}

async function readIndex(root: string): Promise<QrCacheIndex> {
	const indexPath = path.join(root, MAPPING_FILE);
	const file = Bun.file(indexPath);
	if (!(await file.exists())) {
		return {byDomain: {}, byKey: {}};
	}

	try {
		const parsed = (await file.json()) as QrCacheIndex;
		return {
			byDomain: parsed.byDomain ?? {},
			byKey: parsed.byKey ?? {},
		};
	} catch {
		return {byDomain: {}, byKey: {}};
	}
}

async function writeIndex(root: string, index: QrCacheIndex): Promise<void> {
	const indexPath = path.join(root, MAPPING_FILE);
	await mkdir(root, {recursive: true});
	await Bun.write(indexPath, JSON.stringify(index, null, 2));
}

async function persistMapping(mapping: QrCacheMapping, root = qrCacheDir()): Promise<void> {
	const index = await readIndex(root);
	index.byDomain[mapping.domain] = mapping;
	index.byKey[mapping.key] = mapping;
	index.byKey[mapping.HEX] = mapping;
	await writeIndex(root, index);

	const domainMappingPath = qrCacheMappingPath(mapping.domain, root);
	await mkdir(path.dirname(domainMappingPath), {recursive: true});
	await Bun.write(domainMappingPath, JSON.stringify(mapping, null, 2));
}

export class QRCache {
	static cacheKey(domain: string, token: string): string {
		return qrCacheKeyPair(domain, token).key;
	}

	static cacheKeyPair(domain: string, token: string): QrCacheKeyPair {
		return qrCacheKeyPair(domain, token);
	}

	static cachePath(domain: string, token: string): string {
		return qrCachePath(domain, token);
	}

	static buildMapping(
		domain: string,
		token: string,
		serviceName: string,
		secretName = MASTER_TOKEN_SECRET,
	): QrCacheMapping {
		return buildQrCacheMapping(domain, token, serviceName, secretName);
	}

	static async getCached(domain: string, token: string): Promise<string | null> {
		const filePath = this.cachePath(domain, token);
		if (await Bun.file(filePath).exists()) {
			return filePath;
		}
		return null;
	}

	static async save(
		domain: string,
		token: string,
		image: Bun.Image,
		serviceName: string,
		secretName = MASTER_TOKEN_SECRET,
	): Promise<QrCacheMapping> {
		const mapping = buildQrCacheMapping(domain, token, serviceName, secretName);
		await mkdir(path.dirname(mapping.path), {recursive: true});
		await image.write(mapping.path);
		await persistMapping(mapping);
		return mapping;
	}

	/**
	 * Remove cached PNGs older than `maxAgeMs` (default: 30 days).
	 */
	static async purgeStale(maxAgeMs = 30 * 24 * 60 * 60 * 1000, root = qrCacheDir()): Promise<number> {
		const glob = new Bun.Glob('**/*.png');
		const cutoff = Date.now() - maxAgeMs;
		let removed = 0;

		for await (const relativePath of glob.scan({cwd: root, onlyFiles: true})) {
			const filePath = path.join(root, relativePath);
			const file = Bun.file(filePath);
			if (!(await file.exists())) {
				continue;
			}

			const updatedAt = new Date(file.lastModified).getTime();
			if (updatedAt < cutoff) {
				const {unlink} = await import('fs/promises');
				await unlink(filePath);
				removed += 1;
			}
		}

		return removed;
	}

	static async ensure(
		domain: string,
		token: string,
		serviceName: string,
		options: QRGenerateOptions = {},
		secretName = MASTER_TOKEN_SECRET,
	): Promise<{
		image: Bun.Image;
		mapping: QrCacheMapping;
		fromCache: boolean;
	}> {
		const mapping = buildQrCacheMapping(domain, token, serviceName, secretName);
		const cached = await this.getCached(domain, token);

		if (cached) {
			return {
				image: await QRGenerator.fromPath(cached),
				mapping: {...mapping, path: cached, updatedAt: new Date().toISOString()},
				fromCache: true,
			};
		}

		const image = await QRGenerator.toImage(token, options);
		const saved = await this.save(domain, token, image, serviceName, secretName);
		return {image, mapping: saved, fromCache: false};
	}
}