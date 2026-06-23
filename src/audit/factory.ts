import {FEATURE_AUDIT_JSONL, FEATURE_AUDIT_SQLITE} from '../features/index.ts';
import {EncryptedJSONLSink} from './encrypted-jsonl-sink.ts';
import {EncryptedSQLiteSink} from './encrypted-sqlite-sink.ts';
import type {AuditSink, AuditSinkOptions} from './types.ts';

function isSqlitePath(filePath: string): boolean {
	const lower = filePath.toLowerCase();
	return lower.endsWith('.db') || lower.endsWith('.sqlite') || lower.endsWith('.sqlite3');
}

function sqliteUnavailable(): never {
	throw new Error(
		'SQLite audit backend is not included in this build (FEATURE_AUDIT_SQLITE=false)',
	);
}

function jsonlUnavailable(): never {
	throw new Error(
		'JSONL audit backend is not included in this build (FEATURE_AUDIT_JSONL=false)',
	);
}

export function createAuditSink(
	filePath: string,
	masterKey: string,
	options: AuditSinkOptions = {},
): AuditSink {
	if (isSqlitePath(filePath)) {
		if (!FEATURE_AUDIT_SQLITE) {
			sqliteUnavailable();
		}

		return new EncryptedSQLiteSink(filePath, masterKey, options);
	}

	if (!FEATURE_AUDIT_JSONL) {
		jsonlUnavailable();
	}

	return new EncryptedJSONLSink(filePath, masterKey, options);
}