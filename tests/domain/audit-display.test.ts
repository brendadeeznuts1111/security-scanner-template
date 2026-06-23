import {expect, test} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {
	auditEntryColorKey,
	auditEntryTone,
	formatColorizedAuditEntry,
} from '../../src/domain/audit-display.ts';
import type {AuditEntry} from '../../src/audit/types.ts';

const config = applyDefaults({
	domain: 'com.example.display',
	csrf: {enabled: false, tokenLength: 32},
});

function entry(patch: Partial<AuditEntry>): AuditEntry {
	return {
		id: '1',
		package: 'pkg',
		version: '1.0.0',
		requestedRange: '*',
		advisories: [],
		allowed: true,
		decidedAt: new Date().toISOString(),
		...patch,
	};
}

test('auditEntryTone maps blocked, warn, and allowed entries', () => {
	expect(auditEntryTone(entry({allowed: false}))).toBe('blocked');
	expect(
		auditEntryTone(
			entry({
				allowed: true,
				advisories: [
					{level: 'warn', package: 'x', version: '1', url: null, description: null, categories: []},
				],
			}),
		),
	).toBe('warn');
	expect(auditEntryTone(entry({allowed: true}))).toBe('allowed');
});

test('auditEntryColorKey uses supplyChain for blocked without fatal advisories', () => {
	expect(auditEntryColorKey(entry({allowed: false}))).toBe('supplyChain');
	expect(
		auditEntryColorKey(
			entry({
				allowed: false,
				advisories: [
					{
						level: 'fatal',
						package: 'x',
						version: '1',
						url: null,
						description: null,
						categories: [],
					},
				],
			}),
		),
	).toBe('fatal');
});

test('formatColorizedAuditEntry includes serialized entry payload', () => {
	const allowed = formatColorizedAuditEntry(config, entry({allowed: true}));
	const blocked = formatColorizedAuditEntry(config, entry({allowed: false}));
	expect(allowed).toContain('"package":"pkg"');
	expect(blocked).toContain('"package":"pkg"');
	expect(auditEntryColorKey(entry({allowed: true}))).toBe('success');
	expect(auditEntryColorKey(entry({allowed: false}))).toBe('supplyChain');
});
