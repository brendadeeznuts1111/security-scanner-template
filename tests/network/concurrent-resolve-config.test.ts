import {describe, expect, test} from 'bun:test';
import {join} from 'path';
import {DEFAULT_NETWORK_CONFIG} from '../../src/config/defaults.ts';
import type {DomainConfig} from '../../src/config/types.ts';
import {resolveNetworkConfig} from '../../src/network/resolve-config.ts';

const projectRoot = '/tmp/project';
const domain = 'com.example.service';

const RESOLVED_NETWORK_KEYS = [
	'enabled',
	'distPath',
	'resolvedDistPath',
	'healthUrl',
	'healthUrlSecret',
	'baselinePath',
	'resolvedBaselinePath',
	'updateBaseline',
	'probeInterval',
	'watch',
	'watchInterval',
	'debounceMs',
	'failOnHealth',
	'failOnDrift',
	'json',
	'herdrTab',
	'noColor',
] as const;

describe('resolveNetworkConfig defaults', () => {
	test('applies DEFAULT_NETWORK_CONFIG when network block absent', () => {
		const resolved = resolveNetworkConfig({domain, projectRoot});
		expect(resolved).toContainKeys([...RESOLVED_NETWORK_KEYS]);
		expect(resolved.enabled).toBe(DEFAULT_NETWORK_CONFIG.enabled);
		expect(resolved.probeInterval).toBe(DEFAULT_NETWORK_CONFIG.probeInterval ?? 8000);
		expect(resolved.debounceMs).toBe(DEFAULT_NETWORK_CONFIG.debounceMs ?? 500);
		expect(resolved.resolvedDistPath).toBe(join(projectRoot, './dist'));
		expect(resolved.resolvedBaselinePath).toContain('network-baseline.json5');
	});
});

describe('resolveNetworkConfig merge', () => {
	test('merges domain JSON5 service.network with CLI overrides', () => {
		const resolved = resolveNetworkConfig({
			domain,
			projectRoot,
			network: {
				enabled: true,
				distPath: './dist/frontend',
				healthUrl: 'http://localhost:3000/health',
				failOnHealth: true,
			},
			overrides: {
				failOnDrift: true,
				json: true,
				baseline: './custom/baseline.json5',
			},
		});

		expect(resolved.enabled).toBe(true);
		expect(resolved.resolvedDistPath).toBe(join(projectRoot, 'dist/frontend'));
		expect(resolved.healthUrl).toBe('http://localhost:3000/health');
		expect(resolved.failOnHealth).toBe(true);
		expect(resolved.failOnDrift).toBe(true);
		expect(resolved.json).toBe(true);
		expect(resolved.resolvedBaselinePath).toBe(join(projectRoot, 'custom/baseline.json5'));
	});

	test('uses ops.watch.debounceMs when network debounceMs unset', () => {
		const domainConfig = {
			ops: {watch: {debounceMs: 900}},
		} as DomainConfig;

		const resolved = resolveNetworkConfig({
			domain,
			projectRoot,
			network: {enabled: true},
			domainConfig,
		});

		expect(resolved.debounceMs).toBe(900);
	});

	test('honors distPathOverride for supply-chain --path', () => {
		const resolved = resolveNetworkConfig({
			domain,
			projectRoot,
			distPathOverride: '/abs/bundle/dist',
			overrides: {healthUrl: 'http://127.0.0.1/health'},
		});

		expect(resolved.resolvedDistPath).toBe('/abs/bundle/dist');
		expect(resolved.healthUrl).toBe('http://127.0.0.1/health');
	});
});
