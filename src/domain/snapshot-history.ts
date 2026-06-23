import {Database} from 'bun:sqlite';
import {mkdir} from 'fs/promises';
import path from 'path';
import {correlationId} from '../utils/uuid.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS snapshot_history (
	id TEXT PRIMARY KEY,
	domain TEXT NOT NULL,
	fingerprint TEXT NOT NULL,
	previous_fingerprint TEXT,
	changed_sections TEXT,
	operation TEXT NOT NULL,
	timestamp TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshot_history_domain ON snapshot_history(domain);
CREATE INDEX IF NOT EXISTS idx_snapshot_history_timestamp ON snapshot_history(timestamp);
`;

export type SnapshotHistoryOperation = 'write' | 'compare';

export interface SnapshotHistoryRecord {
	id: string;
	domain: string;
	fingerprint: string;
	previousFingerprint?: string;
	changedSections: string[];
	operation: SnapshotHistoryOperation;
	timestamp: string;
}

export class SnapshotHistoryStore {
	private readonly db: Database;

	constructor(private readonly dbPath: string) {
		this.db = new Database(dbPath, {create: true});
		this.db.run(SCHEMA);
	}

	static async open(snapshotRoot: string): Promise<SnapshotHistoryStore> {
		const dbPath = path.join(snapshotRoot, 'history.sqlite');
		await mkdir(snapshotRoot, {recursive: true});
		return new SnapshotHistoryStore(dbPath);
	}

	append(record: SnapshotHistoryRecord): void {
		this.db
			.query(
				`INSERT INTO snapshot_history
				 (id, domain, fingerprint, previous_fingerprint, changed_sections, operation, timestamp)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				record.id,
				record.domain,
				record.fingerprint,
				record.previousFingerprint ?? null,
				JSON.stringify(record.changedSections),
				record.operation,
				record.timestamp,
			);
	}

	listForDomain(domain: string, limit = 50): SnapshotHistoryRecord[] {
		const rows = this.db
			.query(
				`SELECT id, domain, fingerprint, previous_fingerprint, changed_sections, operation, timestamp
				 FROM snapshot_history WHERE domain = ? ORDER BY timestamp DESC LIMIT ?`,
			)
			.all(domain, limit) as Array<{
			id: string;
			domain: string;
			fingerprint: string;
			previous_fingerprint: string | null;
			changed_sections: string;
			operation: SnapshotHistoryOperation;
			timestamp: string;
		}>;

		return rows.map(row => ({
			id: row.id,
			domain: row.domain,
			fingerprint: row.fingerprint,
			previousFingerprint: row.previous_fingerprint ?? undefined,
			changedSections: JSON.parse(row.changed_sections) as string[],
			operation: row.operation,
			timestamp: row.timestamp,
		}));
	}

	close(): void {
		this.db.close();
	}
}

export function newSnapshotHistoryId(): string {
	return `snap-${correlationId()}`;
}
