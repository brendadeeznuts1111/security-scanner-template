import {expect, test, beforeEach, afterEach} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import type {DomainRegistry} from '../../src/config/registry.ts';
import type {DomainConfig} from '../../src/config/types.ts';
import {runTlsScan} from '../../src/cli/tls.ts';
import {TLSInspector} from '../../src/intel/tls/inspector.ts';
import {clearSystemCACache, seedSystemCACacheForTests} from '../../src/intel/tls/system-ca.ts';

function testRegistry(config: DomainConfig): DomainRegistry {
	return {
		async loadAll() {},
		get(domain: string) {
			if (domain !== config.domain) {
				throw new Error(`Unknown domain: ${domain}`);
			}
			return config;
		},
		has(domain: string) {
			return domain === config.domain;
		},
		list() {
			return [config.domain];
		},
		async security() {
			throw new Error('not used');
		},
		async service() {
			throw new Error('not used');
		},
		watch() {},
		unwatch() {},
		async reloadDomain() {
			return null;
		},
	};
}

beforeEach(() => {
	clearSystemCACache();
	seedSystemCACacheForTests([]);
});

afterEach(() => {
	clearSystemCACache();
});

test('runTlsScan enables system CA from domain config', async () => {
	const config = applyDefaults({
		domain: 'com.example.tls',
		tls: {useSystemCA: true},
		csrf: {enabled: false, tokenLength: 32},
	});

	const original = TLSInspector.inspect;
	TLSInspector.inspect = async (_host, _port, options = {}) => ({
		host: 'example.com',
		port: 443,
		validatedWithSystemCA: options.useSystemCA ?? false,
	});

	try {
		const profile = await runTlsScan({
			domain: config.domain,
			host: 'example.com',
			registry: testRegistry(config),
		});
		expect(profile.validatedWithSystemCA).toBe(true);
	} finally {
		TLSInspector.inspect = original;
	}
});

test('runTlsScan CLI flag overrides domain config', async () => {
	const config = applyDefaults({
		domain: 'com.example.tls-flag',
		tls: {useSystemCA: true},
		csrf: {enabled: false, tokenLength: 32},
	});

	const original = TLSInspector.inspect;
	TLSInspector.inspect = async (_host, _port, options = {}) => ({
		host: 'example.com',
		port: 443,
		validatedWithSystemCA: options.useSystemCA ?? false,
	});

	try {
		const profile = await runTlsScan({
			domain: config.domain,
			host: 'example.com',
			useSystemCA: false,
			registry: testRegistry(config),
		});
		expect(profile.validatedWithSystemCA).toBe(false);
	} finally {
		TLSInspector.inspect = original;
	}
});

test('runTlsScan auto-enables system CA when store is populated', async () => {
	seedSystemCACacheForTests(['-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----']);

	const original = TLSInspector.inspect;
	TLSInspector.inspect = async (_host, _port, options = {}) => ({
		host: 'example.com',
		port: 443,
		validatedWithSystemCA: options.useSystemCA ?? false,
	});

	try {
		const profile = await runTlsScan({host: 'example.com'});
		expect(profile.validatedWithSystemCA).toBe(true);
	} finally {
		TLSInspector.inspect = original;
	}
});

test('runTlsScan requires --host', async () => {
	await expect(runTlsScan({host: ''})).rejects.toThrow(/--host/);
});
