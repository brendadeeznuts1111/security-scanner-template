import {expect, test, afterEach} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import type {DomainRegistry} from '../../src/config/registry.ts';
import type {DomainSecurity} from '../../src/config/security.ts';
import {Service} from '../../src/service/index.ts';

let originalServe: typeof Bun.serve;
let servers: Array<ReturnType<typeof Bun.serve>> = [];

afterEach(() => {
	for (const server of servers) {
		server.stop(true);
	}
	servers = [];
	Bun.serve = originalServe;
});

function mockRegistry(config: ReturnType<typeof applyDefaults>): DomainRegistry {
	return {
		async loadAll() {},
		get() {
			return config;
		},
		has: () => true,
		list: () => [config.domain],
		async security() {
			return {
				config,
				csrfSecret: 'test',
				generateCsrfToken: () => 'token',
				verifyCsrfToken: () => ({valid: true}),
				digestHex: async () => 'digest',
				verifyDigest: async () => true,
				satisfiesVersion: () => true,
			} as unknown as DomainSecurity;
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

test('Service.start passes http3 from domain config to Bun.serve', async () => {
	originalServe = Bun.serve;
	const serveCalls: Array<Record<string, unknown>> = [];

	Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
		serveCalls.push(options as unknown as Record<string, unknown>);
		const server = {
			port: 9443,
			hostname: '127.0.0.1',
			stop: () => {},
		};
		servers.push(server as ReturnType<typeof Bun.serve>);
		return server as ReturnType<typeof Bun.serve>;
	}) as unknown as typeof Bun.serve;

	const config = applyDefaults({
		domain: 'com.example.http3',
		csrf: {enabled: false, tokenLength: 32},
		service: {
			http3: true,
			http1: true,
			tls: {cert: '/tmp/cert.pem', key: '/tmp/key.pem'},
		},
	});

	const service = new Service(mockRegistry(config), 'com.example.http3');
	await service.start();

	expect(serveCalls[0]?.http3).toBe(true);
	expect(serveCalls[0]?.http1).toBe(true);
	expect(serveCalls[0]?.tls).toEqual({
		cert: '/tmp/cert.pem',
		key: '/tmp/key.pem',
	});
});

test('Service.start rejects http3 without TLS', async () => {
	const config = applyDefaults({
		domain: 'com.example.no-tls',
		csrf: {enabled: false, tokenLength: 32},
		service: {http3: true},
	});

	const service = new Service(mockRegistry(config), 'com.example.no-tls');
	await expect(service.start()).rejects.toThrow(/HTTP\/3 requires TLS/);
});