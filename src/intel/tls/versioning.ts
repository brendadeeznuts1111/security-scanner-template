import {Database} from 'bun:sqlite';
import {mkdirSync} from 'fs';
import path from 'path';
import {applySqliteSecurityPragmas, type SqliteSecurityPragmaOptions} from './sqlite-pragmas.ts';
import type {TLSProfile} from './types.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tls_scans (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	host TEXT NOT NULL,
	port INTEGER NOT NULL,
	scanned_at TEXT NOT NULL,
	protocol TEXT,
	cipher TEXT,
	fingerprint TEXT,
	score REAL,
	profile_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tls_scans_target ON tls_scans(host, port, scanned_at);
`;

export interface TLSVersioningOptions extends SqliteSecurityPragmaOptions {}

export interface TLSVersionRecord {
	id: number;
	host: string;
	port: number;
	scannedAt: string;
	protocol?: string;
	cipher?: string;
	fingerprint?: string;
	score?: number;
	profile: TLSProfile;
}

/**
 * Persist TLS inspection history in SQLite (bun:sqlite) with 3.53+ hardening PRAGMAs.
 */
export class TLSVersioning {
	private readonly db: Database;

	constructor(dbPath = './.security/tls-history.db', options: TLSVersioningOptions = {}) {
		const resolved = path.resolve(dbPath);
		mkdirSync(path.dirname(resolved), {recursive: true});

		this.db = new Database(resolved, {create: true});
		applySqliteSecurityPragmas(this.db, options);
		this.db.run(SCHEMA);
	}

	/**
	 * Store a TLS profile snapshot. Returns the inserted row id.
	 */
	record(profile: TLSProfile, score?: number, scannedAt = new Date().toISOString()): number {
		const result = this.db
			.query(
				`INSERT INTO tls_scans
				 (host, port, scanned_at, protocol, cipher, fingerprint, score, profile_json)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				profile.host,
				profile.port,
				scannedAt,
				profile.protocol ?? null,
				profile.cipher?.name ?? null,
				profile.certificate?.fingerprint ?? null,
				score ?? null,
				JSON.stringify(profile),
			);

		return Number(result.lastInsertRowid);
	}

	/**
	 * List recent scans for a host/port pair (newest first).
	 */
	recentScans(host: string, port = 443, limit = 50): TLSVersionRecord[] {
		const rows = this.db
			.query(
				`SELECT id, host, port, scanned_at, protocol, cipher, fingerprint, score, profile_json
				 FROM tls_scans
				 WHERE host = ? AND port = ?
				 ORDER BY scanned_at DESC
				 LIMIT ?`,
			)
			.all(host, port, limit) as Array<{
			id: number;
			host: string;
			port: number;
			scanned_at: string;
			protocol: string | null;
			cipher: string | null;
			fingerprint: string | null;
			score: number | null;
			profile_json: string;
		}>;

		return rows.map(row => ({
			id: row.id,
			host: row.host,
			port: row.port,
			scannedAt: row.scanned_at,
			protocol: row.protocol ?? undefined,
			cipher: row.cipher ?? undefined,
			fingerprint: row.fingerprint ?? undefined,
			score: row.score ?? undefined,
			profile: JSON.parse(row.profile_json) as TLSProfile,
		}));
	}

	close(): void {
		this.db.close();
	}
}
