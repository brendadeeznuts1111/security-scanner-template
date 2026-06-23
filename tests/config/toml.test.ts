import {expect, test} from 'bun:test';
import {parseToml} from '../../src/config/toml.ts';

test('parseToml uses Bun.TOML.parse', () => {
	const parsed = parseToml<{policy: {default: {fatal: string[]}}}>(`
[policy.default]
fatal = ["malware"]
`);
	expect(parsed.policy.default.fatal).toEqual(['malware']);
});