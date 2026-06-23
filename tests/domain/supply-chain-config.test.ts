import {expect, test} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {
	domainSupplyChainAuditOptions,
	supplyChainConfigFromDomain,
} from '../../src/domain/supply-chain-config.ts';

test('domainSupplyChainAuditOptions maps JSONL audit path and master key', () => {
	const config = applyDefaults({
		domain: 'com.example.sc-bridge',
		audit: {jsonl: {path: './logs/audit.jsonl.enc', masterKey: 'bridge-key'}},
		csrf: {enabled: false, tokenLength: 32},
	});

	expect(domainSupplyChainAuditOptions(config)).toEqual({
		auditLog: './logs/audit.jsonl.enc',
		auditMasterKey: 'bridge-key',
		auditCompress: false,
	});
});

test('supplyChainConfigFromDomain includes feed, policy, and domain id', () => {
	const config = applyDefaults({
		domain: 'com.example.sc-full',
		supplyChain: {
			enabled: true,
			feed: {remote: 'https://example.com/feed'},
			policy: {fatal: ['malware'], warn: ['adware']},
		},
		csrf: {enabled: false, tokenLength: 32},
	});

	const sc = supplyChainConfigFromDomain(config);
	expect(sc.domain).toBe('com.example.sc-full');
	expect(sc.feed?.remote).toBe('https://example.com/feed');
	expect(sc.policy?.fatal).toEqual(['malware']);
	expect(sc.auditLog).toBe('./.security/com.example.sc-full/audit.jsonl.enc');
});
