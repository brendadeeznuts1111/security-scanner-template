import {expect, test} from 'bun:test';
import {cliBoolean, cliString} from '../../src/utils/cli.ts';

test('cliString returns only string values from parseArgs unions', () => {
	expect(cliString('host.example')).toBe('host.example');
	expect(cliString(true)).toBeUndefined();
	expect(cliString(undefined)).toBeUndefined();
});

test('cliBoolean returns only boolean values from parseArgs unions', () => {
	expect(cliBoolean(true)).toBe(true);
	expect(cliBoolean(false)).toBe(false);
	expect(cliBoolean('yes')).toBeUndefined();
});