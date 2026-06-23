import {Database} from 'bun:sqlite';
import {mkdir} from 'fs/promises';
import path from 'path';
import {encryptText, decryptText, type EncryptedEnvelope} from '../crypto/aes-gcm.ts';
import {compressBytes, decompressBytes} from '../compression/codec.ts';
import type {AuditEntry, AuditSink, AuditSinkOptions} from './types.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS audit_entries (
	id TEXT PRIMARY KEY,
	package TEXT NOT NULL,
	decided_at TEXT NOT NULL,
	payload BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_decided_at ON audit_entries(decided_at);
CREATE INDEX IF NOT EXISTS idx_audit_package ON audit_entries(package);
`;

/**
 * Encrypted SQLite audit sink for queryable, durable compliance logs.
 *
 * Each row stores a compressed (optional) AES-GCM envelope of a single audit
 * entry. Plaintext never touches the database file.
 */
export class EncryptedSQLiteSink implements AuditSink {
	private readonly db: Database;
	private readonly compress: boolean;
	private readonly compressionFormat: 'gzip' | 'zstd';

	constructor(
		private filePath: string,
		private masterKey: string,
		options: AuditSinkOptions = {},
	) {
		this.compress = options.compress ?? true;
		this.compressionFormat = options.compressionFormat ?? 'zstd';
		this.db = new Database(filePath, {create: true});
		this.db.run(SCHEMA);
	}

	/**
	 * Ensure the parent directory exists before opening a new database file.
	 */
	static async ensureParentDir(filePath: string): Promise<void> {
		const dir = path.dirname(filePath);
		await mkdir(dir, {recursive: true});
	}

	/**
	 * Async factory that creates the parent directory before opening the database.
	 */
	static async create(
		filePath: string,
		masterKey: string,
		options: AuditSinkOptions = {},
	): Promise<EncryptedSQLiteSink> {
		await EncryptedSQLiteSink.ensureParentDir(filePath);
		return new EncryptedSQLiteSink(filePath, masterKey, options);
	}

	async append(entry: AuditEntry): Promise<void> {
		const envelope = await encryptText(JSON.stringify(entry), this.masterKey);
		const serialized = new TextEncoder().encode(JSON.stringify(envelope));
		const payload = this.compress ? compressBytes(serialized, this.compressionFormat) : serialized;

		this.db
			.query('INSERT OR REPLACE INTO audit_entries (id, package, decided_at, payload) VALUES (?, ?, ?, ?)')
			.run(entry.id, entry.package, entry.decidedAt, payload);
	}

	async *stream(): AsyncGenerator<AuditEntry> {
		const rows = this.db
			.query('SELECT payload FROM audit_entries ORDER BY decided_at ASC')
			.all() as Array<{payload: Uint8Array}>;

		for (const row of rows) {
			const entry = await this.tryDecryptPayload(row.payload);
			if (entry) {
				yield entry;
			}
		}
	}

	async readAll(): Promise<AuditEntry[]> {
		const entries: AuditEntry[] = [];
		for await (const entry of this.stream()) {
			entries.push(entry);
		}
		return entries;
	}

	/**
	 * Count the total number of audit entries in the database.
	 */
	count(): number {
		const row = this.db.query('SELECT COUNT(*) AS total FROM audit_entries').get() as {
			total: number;
		};
		return row.total;
	}

	/**
	 * Stream audit entries within a decided_at time range.
	 */
	async *streamRange(start: string, end: string): AsyncGenerator<AuditEntry> {
		const rows = this.db
			.query(
				'SELECT payload FROM audit_entries WHERE decided_at >= ? AND decided_at <= ? ORDER BY decided_at ASC',
			)
			.all(start, end) as Array<{payload: Uint8Array}>;

		for (const row of rows) {
			const entry = await this.tryDecryptPayload(row.payload);
			if (entry) {
				yield entry;
			}
		}
	}

	/**
	 * Stream audit entries for a specific package.
	 */
	async *streamByPackage(packageName: string): AsyncGenerator<AuditEntry> {
		const rows = this.db
			.query('SELECT payload FROM audit_entries WHERE package = ? ORDER BY decided_at ASC')
			.all(packageName) as Array<{payload: Uint8Array}>;

		for (const row of rows) {
			const entry = await this.tryDecryptPayload(row.payload);
			if (entry) {
				yield entry;
			}
		}
	}

	close(): void {
		this.db.close();
	}

	private async tryDecryptPayload(payload: Uint8Array): Promise<AuditEntry | null> {
		let envelope: EncryptedEnvelope;
		try {
			const json = new TextDecoder().decode(decompressBytes(payload));
			envelope = JSON.parse(json) as EncryptedEnvelope;
		} catch {
			return null;
		}

		try {
			const plaintext = await decryptText(envelope, this.masterKey);
			return JSON.parse(plaintext) as AuditEntry;
		} catch {
			return null;
		}
	}
}
