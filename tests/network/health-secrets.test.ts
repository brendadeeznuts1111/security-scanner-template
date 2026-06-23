import {expect, test} from 'bun:test';
import {
	formatSecretLogLabel,
	networkHealthSecretService,
	resolveHealthSecretRef,
} from '../../src/network/health-secrets.ts';

test('network health secret service is scoped per domain', () => {
	expect(networkHealthSecretService('com.example.app')).toBe('supply-chain-com.example.app');
});

test('health secret ref uses domain service and full secret name', () => {
	const ref = resolveHealthSecretRef('com.example.app', 'health/prod');
	expect(ref.service).toBe('supply-chain-com.example.app');
	expect(ref.name).toBe('health/prod');
});

test('secret log label is redacted with sha256 prefix', () => {
	const label = formatSecretLogLabel('health/prod');
	expect(label).toContain('[secret:health/prod');
	expect(label).toContain('sha256:');
	expect(label).not.toContain('http');
});
