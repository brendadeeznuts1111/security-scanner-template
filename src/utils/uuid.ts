export {createAuditEntry} from '../audit/entry.ts';

/**
 * UUID helpers aligned with Bun's JavaScript UUID guide.
 *
 * @see https://bun.com/docs/guides/util/javascript-uuid
 * @see https://bun.com/docs/runtime/utils#bun-randomuuidv7
 */
export const BUN_UUID_GUIDE_URL = 'https://bun.com/docs/guides/util/javascript-uuid';
export const BUN_UUID_V7_DOCS_URL = 'https://bun.com/docs/runtime/utils#bun-randomuuidv7';

const UUID_V4_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** UUID v4 via `crypto.randomUUID()` (Bun, Node, browsers). */
export function randomUUID(): string {
	return crypto.randomUUID();
}

export function isUUIDv7Available(): boolean {
	return typeof Bun.randomUUIDv7 === 'function';
}

/**
 * Monotonic UUID v7 (`Bun.randomUUIDv7`) — preferred for audit logs and DB keys.
 */
export function randomUUIDv7(encoding?: 'hex' | 'base64' | 'base64url'): string;
export function randomUUIDv7(encoding: 'buffer'): Buffer;
export function randomUUIDv7(
	encoding?: 'hex' | 'base64' | 'base64url' | 'buffer',
	timestamp?: number,
): string | Buffer;
export function randomUUIDv7(
	encoding?: 'hex' | 'base64' | 'base64url' | 'buffer',
	timestamp?: number,
): string | Buffer {
	if (!isUUIDv7Available()) {
		return randomUUID();
	}
	if (encoding === 'buffer') {
		return timestamp !== undefined
			? Bun.randomUUIDv7('buffer', timestamp)
			: Bun.randomUUIDv7('buffer');
	}
	if (encoding) {
		return timestamp !== undefined
			? Bun.randomUUIDv7(encoding, timestamp)
			: Bun.randomUUIDv7(encoding);
	}
	return timestamp !== undefined ? Bun.randomUUIDv7('hex', timestamp) : Bun.randomUUIDv7();
}

/** Time-sortable id for audit entries and operator correlation (v7 when available). */
export function correlationId(): string {
	return isUUIDv7Available() ? randomUUIDv7() : randomUUID();
}

/** Opaque suffix for scratch files and temp directories in tests/CLI. */
export function scratchId(): string {
	return randomUUID();
}

export function isUUIDv4(value: string): boolean {
	return UUID_V4_RE.test(value);
}

export function isUUIDv7(value: string): boolean {
	return UUID_V7_RE.test(value);
}