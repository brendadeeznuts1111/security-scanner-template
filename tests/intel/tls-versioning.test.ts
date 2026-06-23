import {expect, test, afterEach} from 'bun:test';
import {mkdtemp, rm} from 'fs/promises';
import path from 'path';
import os from 'node:os';
import {Database} from 'bun:sqlite';
import {
	applySqliteSecurityPragmas,
	DEFAULT_SQLITE_FP_PRECISION,
	DEFAULT_SQLITE_PARSER_DEPTH,
} from '../../src/intel/tls/sqlite-pragmas.ts';
import {TLSVersioning} from '../../src/intel/tls/versioning.ts';
import type {TLSProfile} from '../../src/intel/tls/types.ts';

let tempDir = '';

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, {recursive: true, force: true}).catch(() => {});
		tempDir = '';
	}
});

const sampleProfile = (host: string): TLSProfile => ({
	host,
	port: 443,
	protocol: 'TLSv1.3',
	alpn: 'h2',
	cipher: {name: 'TLS_AES_128_GCM_SHA256', version: 'TLSv1.3'},
	certificate: {
		subject: {CN: host},
		issuer: {CN: 'Example CA'},
		validFrom: 'Jan  1 00:00:00 2026 GMT',
		validTo: 'Jan  1 00:00:00 2027 GMT',
		fingerprint: 'aa:bb:cc',
		serialNumber: '1',
		daysRemaining: 300,
		expired: false,
		selfSigned: false,
	},
	validatedWithSystemCA: true,
	trusted: true,
});

test('applySqliteSecurityPragmas applies SQLite 3.53 settings without error', () => {
	const db = new Database(':memory:');
	try {
		expect(() =>
			applySqliteSecurityPragmas(db, {
				fpPrecision: DEFAULT_SQLITE_FP_PRECISION,
				parserDepth: DEFAULT_SQLITE_PARSER_DEPTH,
			}),
		).not.toThrow();

		db.run('CREATE TABLE scores (id INTEGER PRIMARY KEY, value REAL)');
		db.query('INSERT INTO scores(value) VALUES (?)').run(0.123456789012345);
		const row = db.query('SELECT value FROM scores').get() as {value: number};
		expect(row.value).toBe(0.123456789012345);
	} finally {
		db.close();
	}
});

test('TLSVersioning records and retrieves scan history', async () => {
	tempDir = await mkdtemp(path.join(os.tmpdir(), 'tls-versioning-'));
	const dbPath = path.join(tempDir, 'tls-history.db');
	const store = new TLSVersioning(dbPath);

	try {
		const profile = sampleProfile('api.example.com');
		const id = store.record(profile, 99.125);
		expect(id).toBeGreaterThan(0);

		const rows = store.recentScans('api.example.com');
		expect(rows).toHaveLength(1);
		expect(rows[0]?.score).toBe(99.125);
		expect(rows[0]?.profile.protocol).toBe('TLSv1.3');
		expect(rows[0]?.fingerprint).toBe('aa:bb:cc');
	} finally {
		store.close();
	}
});

test('TLSVersioning preserves high-precision float scores', async () => {
	tempDir = await mkdtemp(path.join(os.tmpdir(), 'tls-versioning-fp-'));
	const dbPath = path.join(tempDir, 'tls-history.db');
	const store = new TLSVersioning(dbPath, {fpPrecision: 15});

	try {
		const precise = 0.123456789012345;
		store.record(sampleProfile('fp.example.com'), precise);
		const row = store.recentScans('fp.example.com')[0];
		expect(row?.score).toBe(precise);
	} finally {
		store.close();
	}
});
