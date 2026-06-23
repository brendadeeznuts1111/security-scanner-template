import {expect, test, beforeEach, afterEach} from 'bun:test';
import {mkdtemp, rm} from 'fs/promises';
import path from 'path';
import os from 'node:os';
import {isReverseDnsDomain, reverseDnsPathSegment} from '../../src/domain/branding.ts';
import {isImageAvailable, QRGenerator} from '../../src/visual/index.ts';
import {
	buildQrCacheMapping,
	formatQrCacheMappingLog,
	QRCache,
	qrCacheKeyPair,
	qrCachePath,
} from '../../src/visual/qr-cache.ts';

let cacheRoot = '';

beforeEach(async () => {
	cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'qr-cache-'));
	process.env.QR_CACHE_DIR = cacheRoot;
});

afterEach(async () => {
	delete process.env.QR_CACHE_DIR;
	await rm(cacheRoot, {recursive: true, force: true}).catch(() => {});
});

test('isReverseDnsDomain accepts reverse-DNS identifiers', () => {
	expect(isReverseDnsDomain('com.factory-wager.ledger')).toBe(true);
	expect(isReverseDnsDomain('com.example.app')).toBe(true);
	expect(isReverseDnsDomain('invalid domain')).toBe(false);
});

test('qrCacheKeyPair returns stable key and HEX', () => {
	const first = qrCacheKeyPair('com.example.ledger', 'secret-token');
	const second = qrCacheKeyPair('com.example.ledger', 'secret-token');
	const other = qrCacheKeyPair('com.example.ledger', 'other-token');

	expect(first.key).toBe(second.key);
	expect(first.HEX).toBe(first.key.toUpperCase());
	expect(first.key).not.toBe(other.key);
	expect(/^[0-9a-f]+$/.test(first.key)).toBe(true);
});

test('buildQrCacheMapping nests PNG under reverse-DNS segment', () => {
	const mapping = buildQrCacheMapping(
		'com.factory-wager.ledger',
		'token',
		'com.factory-wager.ledger',
	);

	expect(mapping.domain).toBe('com.factory-wager.ledger');
	expect(mapping.key).toBe(mapping.HEX.toLowerCase());
	expect(mapping.path).toContain(reverseDnsPathSegment('com.factory-wager.ledger'));
	expect(mapping.path).toContain(`${mapping.key}.png`);
	expect(mapping.hashInput).toBe('com.factory-wager.ledger:*');
});

test('formatQrCacheMappingLog includes key, HEX, and reverse-DNS domain', () => {
	const mapping = buildQrCacheMapping('com.example.log', 'tok', 'com.example.log');
	const line = formatQrCacheMappingLog(mapping, true);

	expect(line).toContain('domain=com.example.log');
	expect(line).toContain(`key=${mapping.key}`);
	expect(line).toContain(`HEX=${mapping.HEX}`);
	expect(line).toContain('cache-hit');
});

test('QRCache saves mapping index and reuses PNG', async () => {
	if (!isImageAvailable()) {
		expect(true).toBe(true);
		return;
	}

	const domain = 'com.example.cache';
	const serviceName = 'com.example.cache';
	const token = 'master-token-value';
	const image = await QRGenerator.toImage(token, {size: 128});

	const saved = await QRCache.save(domain, token, image, serviceName);
	expect(saved.path).toBe(qrCachePath(domain, token, cacheRoot));
	expect(await Bun.file(saved.path).exists()).toBe(true);

	const index = await Bun.file(path.join(cacheRoot, 'mapping.json')).json();
	expect(index.byDomain[domain].key).toBe(saved.key);
	expect(index.byKey[saved.key].domain).toBe(domain);
	expect(index.byKey[saved.HEX].HEX).toBe(saved.HEX);

	const domainMapping = await Bun.file(
		path.join(cacheRoot, reverseDnsPathSegment(domain), 'mapping.json'),
	).json();
	expect(domainMapping.HEX).toBe(saved.HEX);

	const ensured = await QRCache.ensure(domain, token, serviceName, {size: 128});
	expect(ensured.fromCache).toBe(true);
	expect(ensured.mapping.path).toBe(saved.path);
});

test('QRCache.purgeStale removes old PNG files', async () => {
	if (!isImageAvailable()) {
		expect(true).toBe(true);
		return;
	}

	const domain = 'com.example.purge';
	const token = 'purge-token';
	const image = await QRGenerator.toImage(token, {size: 64});
	const saved = await QRCache.save(domain, token, image, domain);

	const {utimes} = await import('fs/promises');
	const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
	await utimes(saved.path, stale, stale);

	const removed = await QRCache.purgeStale(30 * 24 * 60 * 60 * 1000, cacheRoot);
	expect(removed).toBeGreaterThan(0);
	expect(await Bun.file(saved.path).exists()).toBe(false);
});
