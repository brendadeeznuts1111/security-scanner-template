import {expect, test} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {
	bundleEndpointsToProbeTargets,
	resolveAllEndpointProbeTargets,
	resolveRouteProbeUrl,
} from '../../src/intel/endpoint-resolve.ts';

test('resolveRouteProbeUrl joins relative routes to health origin', () => {
	expect(resolveRouteProbeUrl('/meta', 'http://127.0.0.1:3000/health')).toBe(
		'http://127.0.0.1:3000/meta',
	);
	expect(resolveRouteProbeUrl('https://api.example.com/health', 'http://ignored')).toBe(
		'https://api.example.com/health',
	);
});

test('bundleEndpointsToProbeTargets includes meta and health routes', () => {
	const targets = bundleEndpointsToProbeTargets(
		{
			raw: 3,
			unique: 3,
			endpoints: ['/api/v1/meta', 'https://cdn.example.com/ping'],
			healthRoutes: ['/health', '/readyz'],
			hits: [],
		},
		'http://127.0.0.1:3000/health',
	);
	const urls = targets.map(target => target.url);
	expect(urls).toContain('http://127.0.0.1:3000/api/v1/meta');
	expect(urls).toContain('http://127.0.0.1:3000/health');
	expect(urls).toContain('http://127.0.0.1:3000/readyz');
	expect(urls).toContain('https://cdn.example.com/ping');
	expect(targets.find(t => t.label === 'meta')?.expectStatus).toBe(200);
});

test('resolveAllEndpointProbeTargets merges domain policy health and bundle', () => {
	const config = applyDefaults({
		domain: 'com.example.resolve',
		intel: {
			endpoints: [{url: 'http://127.0.0.1:4000/custom', label: 'custom'}],
		},
	});
	const targets = resolveAllEndpointProbeTargets(
		config,
		{
			intel: {
				endpoints: [{url: 'http://127.0.0.1:4000/policy', label: 'policy'}],
			},
		},
		{
			healthUrl: 'http://127.0.0.1:3000/health',
			bundleNetwork: {
				raw: 1,
				unique: 1,
				endpoints: ['/meta'],
				healthRoutes: [],
				hits: [],
			},
		},
	);
	const urls = targets.map(target => target.url);
	expect(urls).toContain('http://127.0.0.1:4000/custom');
	expect(urls).toContain('http://127.0.0.1:4000/policy');
	expect(urls).toContain('http://127.0.0.1:3000/health');
	expect(urls).toContain('http://127.0.0.1:3000/meta');
});