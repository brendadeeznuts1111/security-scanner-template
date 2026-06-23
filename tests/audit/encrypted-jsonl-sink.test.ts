import {expect, test, beforeEach, afterEach} from 'bun:test';
import {createAuditEntry} from '../../src/audit/entry.ts';
import {EncryptedJSONLSink, type AuditEntry} from '../../src/audit/encrypted-jsonl-sink.ts';

const TEST_DIR = `/tmp/audit-sink-test-${crypto.randomUUID()}`;

beforeEach(async () => {
	await Bun.write(TEST_DIR, '').catch(() => {});
	const {rm, mkdir} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
	await mkdir(TEST_DIR, {recursive: true});
});

afterEach(async () => {
	const {rm} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
});

function makeEntry(packageName: string): AuditEntry {
	return createAuditEntry({
		package: packageName,
		version: '1.0.0',
		requestedRange: '^1.0.0',
		advisories: [],
		allowed: true,
		decidedAt: new Date().toISOString(),
	});
}

test('append and readAll round-trip', async () => {
	const path = `${TEST_DIR}/audit.jsonl.enc`;
	const sink = new EncryptedJSONLSink(path, 'test-key');

	await sink.append(makeEntry('first'));
	await sink.append(makeEntry('second'));

	const entries = await sink.readAll();
	expect(entries.length).toBe(2);
	expect(entries[0]?.package).toBe('first');
	expect(entries[1]?.package).toBe('second');
	expect(entries[0]?.id).toMatch(/^[0-9a-f-]{36}$/i);
});

test('stream yields entries lazily', async () => {
	const path = `${TEST_DIR}/audit.jsonl.enc`;
	const sink = new EncryptedJSONLSink(path, 'test-key');

	await sink.append(makeEntry('a'));
	await sink.append(makeEntry('b'));

	const collected: string[] = [];
	for await (const entry of sink.stream()) {
		collected.push(entry.package);
	}
	expect(collected).toEqual(['a', 'b']);
});

test('wrong master key fails to decrypt', async () => {
	const path = `${TEST_DIR}/audit.jsonl.enc`;
	const sink = new EncryptedJSONLSink(path, 'test-key');
	await sink.append(makeEntry('secret'));

	const evilSink = new EncryptedJSONLSink(path, 'wrong-key');
	const entries = await evilSink.readAll();
	expect(entries.length).toBe(0);
});

test('corrupted line is skipped without halting the stream', async () => {
	const path = `${TEST_DIR}/audit.jsonl.enc`;
	const sink = new EncryptedJSONLSink(path, 'test-key');

	await sink.append(makeEntry('before'));
	await sink.append(makeEntry('after'));

	const text = await Bun.file(path).text();
	const lines = text.split('\n').filter(line => line.trim().length > 0);
	lines[1] = '{"iv":"aaaa","authTag":"bbbb","data":"cccc"}';
	await Bun.write(path, lines.join('\n') + '\n');

	const entries = await sink.readAll();
	expect(entries.length).toBe(1);
	expect(entries[0]?.package).toBe('before');
});

test('compressed sink round-trips', async () => {
	const path = `${TEST_DIR}/audit.jsonl.enc`;
	const sink = new EncryptedJSONLSink(path, 'test-key', {compress: true});

	await sink.append(makeEntry('compressed'));
	const entries = await sink.readAll();
	expect(entries[0]?.package).toBe('compressed');
});

test('concurrent appends preserve every entry', async () => {
	const path = `${TEST_DIR}/audit-concurrent.jsonl.enc`;
	const sink = new EncryptedJSONLSink(path, 'test-key');

	await Promise.all(Array.from({length: 20}, (_, index) => sink.append(makeEntry(`pkg-${index}`))));

	const entries = await sink.readAll();
	expect(entries).toHaveLength(20);
	expect(new Set(entries.map(entry => entry.package)).size).toBe(20);
});

test('parseChunk decrypts complete lines from a partial buffer', async () => {
	const path = `${TEST_DIR}/audit.jsonl.enc`;
	const sink = new EncryptedJSONLSink(path, 'test-key');

	await sink.append(makeEntry('chunked'));
	const text = await Bun.file(path).text();

	const collected: string[] = [];
	for await (const entry of sink.parseChunk(text)) {
		collected.push(entry.package);
	}
	expect(collected).toEqual(['chunked']);
});
