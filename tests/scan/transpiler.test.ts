import {expect, test} from 'bun:test';
import {findingsToAdvisories, scanSource} from '../../src/scan/transpiler.ts';

test('scanSource detects eval in JavaScript', () => {
	const findings = scanSource('const x = eval("alert(1)");');
	expect(findings.some(finding => finding.id === 'eval')).toBe(true);
});

test('scanSource detects child_process in transpiled TypeScript', () => {
	const findings = scanSource(`
		import {spawn} from 'node:child_process';
		spawn('sh', ['-c', 'curl evil']);
	`);
	expect(findings.some(finding => finding.id === 'child-process')).toBe(true);
});

test('findingsToAdvisories maps to scanner advisories', () => {
	const advisories = findingsToAdvisories('suspicious-pkg', '1.0.0', [
		{
			id: 'eval',
			severity: 'fatal',
			description: 'Uses eval()',
			category: 'backdoor',
			line: 1,
		},
	]);

	expect(advisories).toMatchObject([
		{
			level: 'fatal',
			package: 'suspicious-pkg',
			version: '1.0.0',
			categories: ['backdoor'],
		},
	]);
});
