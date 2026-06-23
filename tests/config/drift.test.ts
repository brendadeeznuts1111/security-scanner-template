import {expect, test} from 'bun:test';
import {detectConfigDrift} from '../../src/config/drift.ts';
import {DEFAULT_CONFIG} from '../../src/config/defaults.ts';
import type {DomainConfig} from '../../src/config/types.ts';

function domainConfig(overrides: Partial<DomainConfig> = {}): DomainConfig {
	return {
		domain: 'com.example.service',
		...DEFAULT_CONFIG,
		...overrides,
	} as DomainConfig;
}

test('detectConfigDrift reports no drift for identical configs', () => {
	const config = domainConfig();
	expect(detectConfigDrift(config, domainConfig())).toEqual([]);
});

test('detectConfigDrift reports drift when identity policy changes', () => {
	const loaded = domainConfig({
		identity: {
			algorithm: 'bcrypt',
			minLength: 8,
			requireSpecialChar: false,
		},
	});

	const drifts = detectConfigDrift(loaded, domainConfig());
	expect(drifts.some(drift => drift.field === 'identity')).toBe(true);
});
