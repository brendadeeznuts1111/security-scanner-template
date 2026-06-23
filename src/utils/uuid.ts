export {createAuditEntry} from '../audit/entry.ts';

/**
 * Generate a time-sortable UUIDv7 correlation ID.
 */
export function randomUUIDv7(): string {
	return Bun.randomUUIDv7();
}
