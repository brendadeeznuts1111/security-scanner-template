import {expect, test} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {
	createDomainAuditSink,
	defaultJsonlAuditPath,
	defaultSqliteAuditPath,
	resolveDomainAudit,
	resolveDomainAuditMasterKey,
	resolveDomainAuditPath,
} from '../../src/domain/audit-paths.ts';
import {createAuditEntry} from '../../src/audit/entry.ts';

test('defaultJsonlAuditPath uses reverse-DNS filesystem segment', () => {
	expect(defaultJsonlAuditPath('com.factory-wager.ledger')).toBe(
		'./.security/com.factory-wager.ledger/audit.jsonl.enc',
	);
});

test('defaultSqliteAuditPath uses reverse-DNS filesystem segment', () => {
	expect(defaultSqliteAuditPath('com.example.service')).toBe(
		'./.security/com.example.service/audit.sqlite',
	);
});

test('applyDefaults sets per-domain JSONL audit path', () => {
	const config = applyDefaults({domain: 'com.example.audit'});
	expect(config.audit?.jsonl?.path).toBe('./.security/com.example.audit/audit.jsonl.enc');
	expect(config.audit?.jsonl?.masterKey).toBeNull();
});

test('resolveDomainAudit prefers JSONL when both backends are configured', () => {
	const config = applyDefaults({
		domain: 'com.example.both',
		audit: {
			jsonl: {path: './custom/audit.jsonl.enc', masterKey: 'jsonl-key'},
			sqlite: {path: './custom/audit.sqlite', masterKey: 'sqlite-key'},
		},
	});

	const resolved = resolveDomainAudit(config);
	expect(resolved?.kind).toBe('jsonl');
	expect(resolved?.path).toBe('./custom/audit.jsonl.enc');
	expect(resolveDomainAuditPath(config)).toBe('./custom/audit.jsonl.enc');
});

test('resolveDomainAuditMasterKey reads jsonl masterKey and env fallback', () => {
	const config = applyDefaults({
		domain: 'com.example.keyed',
		audit: {jsonl: {path: './a.jsonl.enc', masterKey: 'inline-key'}},
	});
	expect(resolveDomainAuditMasterKey(config)).toBe('inline-key');

	const envConfig = applyDefaults({
		domain: 'com.example.env',
		audit: {jsonl: {path: './a.jsonl.enc', masterKey: null}},
	});
	expect(resolveDomainAuditMasterKey(envConfig, 'env-audit-key')).toBe('env-audit-key');
});

test('createDomainAuditSink persists entries to encrypted JSONL', async () => {
	const dir = `/tmp/audit-paths-${crypto.randomUUID()}`;
	const path = `${dir}/audit.jsonl.enc`;
	const config = applyDefaults({
		domain: 'com.example.sink',
		audit: {jsonl: {path, masterKey: 'sink-key'}},
		csrf: {enabled: false, tokenLength: 32},
	});

	const sink = createDomainAuditSink(config, 'sink-key');
	expect(sink).not.toBeNull();

	await sink!.append(
		createAuditEntry({
			package: 'left-pad',
			version: '1.0.0',
			requestedRange: '*',
			advisories: [],
			allowed: true,
			decidedAt: new Date().toISOString(),
		}),
	);

	const all = await sink!.readAll();
	expect(all).toHaveLength(1);
	expect(all[0]?.package).toBe('left-pad');

	await Bun.file(path)
		.delete()
		.catch(() => {});
});
