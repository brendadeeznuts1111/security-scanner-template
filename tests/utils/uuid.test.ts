/**
 * @see https://bun.com/docs/guides/util/javascript-uuid
 */
import {expect, test} from 'bun:test';
import {
	correlationId,
	isUUIDv4,
	isUUIDv7,
	isUUIDv7Available,
	randomUUID,
	randomUUIDv7,
	scratchId,
} from '../../src/utils/uuid.ts';

test('randomUUID returns a v4 string per Bun guide', () => {
	const id = randomUUID();
	expect(isUUIDv4(id)).toBe(true);
	expect(scratchId()).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
	);
});

test('randomUUIDv7 returns monotonic v7 when Bun API is available', () => {
	if (!isUUIDv7Available()) {
		expect(randomUUIDv7()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		);
		return;
	}
	const a = randomUUIDv7();
	const b = randomUUIDv7();
	expect(isUUIDv7(a)).toBe(true);
	expect(isUUIDv7(b)).toBe(true);
	expect(a < b).toBe(true);
});

test('correlationId prefers v7 for sortable audit keys', () => {
	const id = correlationId();
	if (isUUIDv7Available()) {
		expect(isUUIDv7(id)).toBe(true);
	} else {
		expect(isUUIDv4(id)).toBe(true);
	}
});

test('randomUUIDv7 supports buffer encoding', () => {
	if (!isUUIDv7Available()) return;
	const buf = randomUUIDv7('buffer');
	expect(buf).toBeInstanceOf(Buffer);
	expect(buf.byteLength).toBe(16);
});