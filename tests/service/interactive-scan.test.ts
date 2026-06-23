import {expect, test, beforeEach, afterEach} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import type {DomainRegistry} from '../../src/config/registry.ts';
import type {DomainConfig} from '../../src/config/types.ts';
import {Service} from '../../src/service/index.ts';

let originalWhich: typeof Bun.which;
let originalSpawn: typeof Bun.spawn;

function testRegistry(config: DomainConfig): DomainRegistry {
	return {
		root: process.cwd(),
		async loadAll() {},
		async ensureDomain() {},
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
		async service(domain, route, options) {
			const svc = new Service(testRegistry(config), domain, route);
			await svc.start(options);
			return svc;
		},
		watch() {},
		unwatch() {},
		async checkPackageVersions() {
			return [];
		},
		async scanPatterns() {
			return [];
		},
		async loadThreatFeed() {},
		checkPackageThreats() {
			return [];
		},
		checkPackagesThreats() {
			return new Map();
		},
		getLoadedThreats() {
			return [];
		},
		async reloadDomain() {
			return null;
		},
	};
}

beforeEach(() => {
	originalWhich = Bun.which;
	originalSpawn = Bun.spawn;
	process.env.SP_FORCE_SHELL = '1';
});

afterEach(() => {
	(Bun as unknown as {which: typeof Bun.which}).which = originalWhich;
	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = originalSpawn;
	delete process.env.SP_FORCE_SHELL;
});

test('Service.runInteractiveScanner requires service.interactive', async () => {
	const config = applyDefaults({
		domain: 'com.example.interactive-off',
		service: {interactive: false},
	});

	const service = new Service(testRegistry(config), config.domain);
	await expect(service.runInteractiveScanner('trivy')).rejects.toThrow(
		'Interactive scanning is disabled',
	);
});

test('Service.runInteractiveScanner runs tool when interactive is enabled', async () => {
	process.env.SP_FORCE_SHELL = '1';

	(Bun as unknown as {which: typeof Bun.which}).which = (() =>
		'/usr/bin/trivy') as typeof Bun.which;
	(Bun as unknown as {spawn: typeof Bun.spawn}).spawn = () =>
		({
			exited: Promise.resolve(0),
			terminal: {
				write: () => {},
				close: () => {},
				resize: () => {},
			},
			kill: () => {},
		}) as unknown as ReturnType<typeof Bun.spawn>;

	const config = applyDefaults({
		domain: 'com.example.interactive-on',
		service: {interactive: true},
		csrf: {enabled: false, tokenLength: 32},
	});

	const service = new Service(testRegistry(config), config.domain);
	const result = await service.runInteractiveScanner('trivy', ['--version']);
	expect(result.exitCode).toBe(0);
	expect(result.command).toBe('/usr/bin/trivy');

	delete process.env.SP_FORCE_SHELL;
});
