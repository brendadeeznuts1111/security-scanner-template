import {expect, test} from 'bun:test';
import {parseCommandLine} from '../../src/interactive/parse.ts';

test('parseCommandLine splits on whitespace', () => {
	expect(parseCommandLine('scan trivy --version')).toEqual(['scan', 'trivy', '--version']);
});

test('parseCommandLine respects double quotes', () => {
	expect(parseCommandLine('scan trivy "filesystem --scanners vuln"')).toEqual([
		'scan',
		'trivy',
		'filesystem --scanners vuln',
	]);
});

test('parseCommandLine respects single quotes', () => {
	expect(parseCommandLine("build --profile 'agent'")).toEqual(['build', '--profile', 'agent']);
});
