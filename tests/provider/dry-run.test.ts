import {expect, test} from 'bun:test';
import {applyDryRun, countFatal} from '../../src/provider/dry-run.ts';

test('applyDryRun downgrades fatal advisories to warn', () => {
	const advisories: Bun.Security.Advisory[] = [
		{
			level: 'fatal',
			package: 'malware-pkg',
			url: 'https://example.com',
			description: 'Known malware',
			categories: ['malware'],
		},
	];

	const result = applyDryRun(advisories, {dryRun: true});
	expect(result).toMatchObject([
		{
			level: 'warn',
			package: 'malware-pkg',
			description: '[DRY RUN] Would block: Known malware',
		},
	]);
});

test('applyDryRun leaves warn advisories unchanged', () => {
	const advisories: Bun.Security.Advisory[] = [
		{
			level: 'warn',
			package: 'protest-pkg',
			url: null,
			description: 'Protestware',
			categories: ['protestware'],
		},
	];

	const result = applyDryRun(advisories, {dryRun: true});
	expect(result).toMatchObject([{level: 'warn', package: 'protest-pkg'}]);
});

test('applyDryRun is a no-op when dryRun is false', () => {
	const advisories: Bun.Security.Advisory[] = [
		{
			level: 'fatal',
			package: 'malware-pkg',
			url: null,
			description: 'Known malware',
			categories: ['malware'],
		},
	];

	const result = applyDryRun(advisories, {dryRun: false});
	expect(result).toMatchObject([{level: 'fatal', package: 'malware-pkg'}]);
});

test('countFatal counts fatal advisories', () => {
	const advisories: Bun.Security.Advisory[] = [
		{level: 'fatal', package: 'a', url: null, description: null},
		{level: 'warn', package: 'b', url: null, description: null},
		{level: 'fatal', package: 'c', url: null, description: null},
	];
	expect(countFatal(advisories)).toBe(2);
});
