export {EncryptedSQLiteSink} from './encrypted-sqlite-sink.ts';
export type {AuditSink as AuditSinkInterface, AuditSinkOptions, AuditEntry} from './types.ts';

import {EncryptedSQLiteSink} from './encrypted-sqlite-sink.ts';
import type {AuditSinkOptions} from './types.ts';

/**
 * Per-domain audit sink backed by an encrypted SQLite database.
 */
export class AuditSink extends EncryptedSQLiteSink {
	constructor(filePath: string, masterKey: string, options?: AuditSinkOptions) {
		super(filePath, masterKey, options);
	}
}
