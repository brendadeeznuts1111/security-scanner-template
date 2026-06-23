import {expect, test} from 'bun:test';
import {hostnameFromUrl, inspectDomain, inspectFeedUrl} from '../../src/threat-intel/dns.ts';

test('hostnameFromUrl extracts hostnames', () => {
	expect(hostnameFromUrl('https://threats.example.com/v1/feed')).toBe('threats.example.com');
	expect(hostnameFromUrl('not-a-url')).toBeNull();
});

test('inspectDomain resolves public hostnames', async () => {
	const result = await inspectDomain('example.com');
	expect(result.resolved).toBe(true);
	expect(result.addresses.length).toBeGreaterThan(0);
	expect(result.suspicious).toBe(false);
});

test('inspectDomain flags blocklisted addresses', async () => {
	const lookup = await inspectDomain('example.com');
	const blocked = lookup.addresses[0]?.address ?? '127.0.0.1';
	const result = await inspectDomain('example.com', {blocklist: [blocked]});
	expect(result.suspicious).toBe(true);
	expect(result.reason).toContain('blocked address');
});

test('inspectFeedUrl returns null for invalid URLs', async () => {
	expect(await inspectFeedUrl('not-a-url')).toBeNull();
});
