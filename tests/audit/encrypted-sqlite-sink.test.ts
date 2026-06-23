import {expect, test, beforeEach, afterEach} from 'bun:test';
import {createAuditEntry} from '../../src/audit/entry.ts';
import {EncryptedSQLiteSink} from '../../src/audit/encrypted-sqlite-sink.ts';

const TEST_DIR = `/tmp/audit-sqlite-test-${crypto.randomUUID()}`;

beforeEach(async () => {
	const {rm, mkdir} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
	await mkdir(TEST_DIR, {recursive: true});
});

afterEach(async () => {
	const {rm} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
});

test('sqlite sink persists and reloads entries', async () => {
	const path = `${TEST_DIR}/audit.sqlite`;
	const sink = new EncryptedSQLiteSink(path, 'sqlite-key');

	await sink.append(
		createAuditEntry({
			package: 'sqlite-pkg',
			version: '2.0.0',
			requestedRange: '^2.0.0',
			advisories: [],
			allowed: true,
			decidedAt: new Date().toISOString(),
		}),
	);

	const entries = await sink.readAll();
	expect(entries.length).toBe(1);
	expect(entries[0]?.package).toBe('sqlite-pkg');
	expect(entries[0]?.id).toMatch(/^[0-9a-f-]{36}$/i);
	sink.close();
});

test('sqlite sink survives reopen', async () => {
	const path = `${TEST_DIR}/audit.sqlite`;
	const first = new EncryptedSQLiteSink(path, 'sqlite-key');
	await first.append(
		createAuditEntry({
			package: 'persisted',
			version: '1.0.0',
			requestedRange: '1.0.0',
			advisories: [],
			allowed: false,
			decidedAt: new Date().toISOString(),
		}),
	);
	first.close();

	const second = new EncryptedSQLiteSink(path, 'sqlite-key');
	const entries = await second.readAll();
	expect(entries[0]?.package).toBe('persisted');
	second.close();
});

test('sqlite sink create factory ensures parent directory', async () => {
	const path = `${TEST_DIR}/nested/dir/audit.sqlite`;
	const sink = await EncryptedSQLiteSink.create(path, 'sqlite-key');
	await sink.append(
		createAuditEntry({
			package: 'factory-pkg',
			version: '1.0.0',
			requestedRange: '1.0.0',
			advisories: [],
			allowed: true,
			decidedAt: new Date().toISOString(),
		}),
	);
	expect(await Bun.file(path).exists()).toBe(true);
	const entries = await sink.readAll();
	expect(entries[0]?.package).toBe('factory-pkg');
	sink.close();
});

test('sqlite sink counts entries', async () => {
	const path = `${TEST_DIR}/count.sqlite`;
	const sink = new EncryptedSQLiteSink(path, 'sqlite-key');
	expect(sink.count()).toBe(0);
	await sink.append(
		createAuditEntry({
			package: 'count-pkg',
			version: '1.0.0',
			requestedRange: '1.0.0',
			advisories: [],
			allowed: true,
			decidedAt: new Date().toISOString(),
		}),
	);
	expect(sink.count()).toBe(1);
	sink.close();
});

test('sqlite sink queries by package', async () => {
	const path = `${TEST_DIR}/by-package.sqlite`;
	const sink = new EncryptedSQLiteSink(path, 'sqlite-key');
	await sink.append(
		createAuditEntry({
			package: 'alpha',
			version: '1.0.0',
			requestedRange: '1.0.0',
			advisories: [],
			allowed: true,
			decidedAt: new Date().toISOString(),
		}),
	);
	await sink.append(
		createAuditEntry({
			package: 'beta',
			version: '2.0.0',
			requestedRange: '^2.0.0',
			advisories: [],
			allowed: false,
			decidedAt: new Date().toISOString(),
		}),
	);
	await sink.append(
		createAuditEntry({
			package: 'alpha',
			version: '1.1.0',
			requestedRange: '^1.0.0',
			advisories: [],
			allowed: true,
			decidedAt: new Date().toISOString(),
		}),
	);

	const alpha = await Array.fromAsync(sink.streamByPackage('alpha'));
	expect(alpha.length).toBe(2);
	expect(alpha.every(e => e.package === 'alpha')).toBe(true);
	sink.close();
});

test('sqlite sink compresses payload with zstd', async () => {
	const path = `${TEST_DIR}/compressed.sqlite`;
	const sink = new EncryptedSQLiteSink(path, 'sqlite-key', {
		compress: true,
		compressionFormat: 'zstd',
	});
	await sink.append(
		createAuditEntry({
			package: 'compressed',
			version: '1.0.0',
			requestedRange: '1.0.0',
			advisories: Array.from({length: 100}, (_, i) => ({
				level: 'warn' as const,
				package: 'compressed',
				version: '1.0.0',
				url: null,
				description: `Advisory ${i}: ${'x'.repeat(200)}`,
				categories: ['deprecated'],
			})),
			allowed: true,
			decidedAt: new Date().toISOString(),
		}),
	);
	const entries = await sink.readAll();
	expect(entries.length).toBe(1);
	expect(entries[0]?.package).toBe('compressed');
	sink.close();
});
