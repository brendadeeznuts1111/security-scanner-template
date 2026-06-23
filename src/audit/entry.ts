import {randomUUIDv7} from '../utils/uuid.ts';
import type {AuditEntry} from './types.ts';

/**
 * Create an audit entry with a time-sortable correlation ID.
 */
export function createAuditEntry(fields: Omit<AuditEntry, 'id'>): AuditEntry {
	return {
		id: randomUUIDv7(),
		...fields,
	};
}
