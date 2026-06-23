import {expect, test} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {brightenColor} from '../../src/color/index.ts';
import {
	CONCERN_COLOR_RULES,
	concernRulesByTag,
	getConcernColorRuleForCode,
	resolveConcernColors,
	resolveIssueColor,
} from '../../src/domain/concern-colors.ts';

const config = applyDefaults({
	domain: 'com.example.colors',
	colors: {
		primary: '#0A84FF',
		secondary: '#30D158',
		fatal: '#FF453A',
		warn: '#FF9500',
		info: '#0A84FF',
		success: '#30D158',
	},
	channels: {
		vault: '#112233',
		identity: '#223344',
		token: '#334455',
		csrf: '#445566',
		supplyChain: '#556677',
		ops: '#667788',
	},
});

test('CONCERN_COLOR_RULES includes channel rules linked to error codes', () => {
	const vaultRule = CONCERN_COLOR_RULES.find(rule => rule.id === 'concern-channel-vault');
	expect(vaultRule?.colorPath).toBe('channels.vault');
	expect(vaultRule?.tags).toContain('vault');
	expect(vaultRule?.errorCodes).toContain('VAULT_MISSING');
});

test('concernRulesByTag filters ast-grep-style tags', () => {
	const rules = concernRulesByTag('supply-chain');
	expect(rules.some(rule => rule.concern === 'supplyChain')).toBe(true);
});

test('resolveConcernColors maps base and bright values', () => {
	const rows = resolveConcernColors(config);
	const vault = rows.find(row => row.concern === 'vault');
	expect(vault?.base).toBe('#112233');
	expect(vault?.bright).toBe(brightenColor('#112233') ?? '#112233');
	expect(vault?.cssVar).toBe('--domain-channels-vault');
});

test('resolveIssueColor uses error code channel mapping', () => {
	const color = resolveIssueColor(config, {
		severity: 'error',
		code: 'VAULT_MISSING',
	});
	expect(color).toBe('#112233');
});

test('resolveIssueColor falls back to severity colors', () => {
	expect(resolveIssueColor(config, {severity: 'warning'})).toBe('#FF9500');
});

test('getConcernColorRuleForCode resolves catalog entries', () => {
	const rule = getConcernColorRuleForCode('CSRF_MISMATCH');
	expect(rule?.colorPath).toBe('channels.csrf');
});
