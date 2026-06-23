import {expect, test} from 'bun:test';
import {applyPolicy, mergePolicies, severityPolicyFromDocument} from '../../src/policy/engine.ts';
import type {PolicyDocument, PolicyRule} from '../../src/policy/types.ts';

function advisoryFixture(overrides: Partial<Bun.Security.Advisory> = {}): Bun.Security.Advisory {
	return {
		level: 'fatal',
		package: 'example-pkg',
		version: '1.0.0',
		url: null,
		description: 'Test advisory',
		categories: ['malware'],
		...overrides,
	};
}

test('applyPolicy ignores matching advisories', () => {
	const rules: PolicyRule[] = [{package: 'trusted-*', action: 'ignore', reason: 'Trusted prefix'}];
	const advisories = [
		advisoryFixture({package: 'trusted-app', level: 'fatal'}),
		advisoryFixture({package: 'untrusted-app', level: 'fatal'}),
	];

	const {filtered, ignored} = applyPolicy(advisories, rules);
	expect(ignored).toBe(1);
	expect(filtered.length).toBe(1);
	expect(filtered[0]?.package).toBe('untrusted-app');
});

test('applyPolicy escalates warn to fatal', () => {
	const rules: PolicyRule[] = [
		{
			category: 'cryptographic-weakness',
			action: 'escalate',
			to: 'fatal',
			reason: 'Crypto blocks release',
		},
	];
	const advisories = [advisoryFixture({level: 'warn', categories: ['cryptographic-weakness']})];

	const {filtered, escalated} = applyPolicy(advisories, rules);
	expect(escalated).toBe(1);
	expect(filtered[0]?.level).toBe('fatal');
});

test('applyPolicy downgrades fatal to warn', () => {
	const rules: PolicyRule[] = [
		{package: 'deprecated-internal', action: 'downgrade', to: 'warn', reason: 'Internal only'},
	];
	const advisories = [advisoryFixture({package: 'deprecated-internal', level: 'fatal'})];

	const {filtered, downgraded} = applyPolicy(advisories, rules);
	expect(downgraded).toBe(1);
	expect(filtered[0]?.level).toBe('warn');
});

test('applyPolicy matches version ranges', () => {
	const rules: PolicyRule[] = [
		{package: 'lodash', version: '>=4.17.21', action: 'ignore', reason: 'Fixed in our fork'},
	];
	const advisories = [
		advisoryFixture({package: 'lodash', version: '4.17.20', level: 'fatal'}),
		advisoryFixture({package: 'lodash', version: '4.17.21', level: 'fatal'}),
	];

	const {filtered, ignored} = applyPolicy(advisories, rules);
	expect(ignored).toBe(1);
	expect(filtered[0]?.version).toBe('4.17.20');
});

test('applyPolicy matches CVE patterns', () => {
	const rules: PolicyRule[] = [{cve: 'CVE-2021-23337', action: 'ignore', reason: 'False positive'}];
	const advisories = [
		advisoryFixture({cve: 'CVE-2021-23337', level: 'fatal'}),
		advisoryFixture({cve: 'CVE-2022-99999', level: 'fatal'}),
	];

	const {filtered, ignored} = applyPolicy(advisories, rules);
	expect(ignored).toBe(1);
	expect(filtered[0]?.cve).toBe('CVE-2022-99999');
});

test('severityPolicyFromDocument extracts defaults', () => {
	const doc: PolicyDocument = {
		default: {
			fatal: ['malware'],
			warn: ['deprecated'],
		},
	};

	expect(severityPolicyFromDocument(doc)).toEqual({
		fatal: ['malware'],
		warn: ['deprecated'],
	});
});

test('severityPolicyFromDocument falls back to built-in defaults', () => {
	expect(severityPolicyFromDocument({})).toEqual({
		fatal: ['backdoor', 'botnet', 'token-stealer', 'malware'],
		warn: ['protestware', 'adware', 'deprecated', 'unmaintained'],
	});
});

test('mergePolicies combines defaults and overrides', () => {
	const a: PolicyDocument = {
		default: {fatal: ['malware']},
		override: [{package: 'a', action: 'ignore', reason: 'A'}],
	};
	const b: PolicyDocument = {
		default: {warn: ['deprecated']},
		override: [{package: 'b', action: 'ignore', reason: 'B'}],
	};

	const merged = mergePolicies([a, b]);
	expect(merged.default).toEqual({fatal: ['malware'], warn: ['deprecated']});
	expect(merged.override?.length).toBe(2);
});
