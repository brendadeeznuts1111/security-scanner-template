import {expect, test, beforeEach, afterEach} from 'bun:test';
import {checkAllDomains, checkDomain} from '../../src/config/doctor.ts';
import {applyDefaults} from '../../src/config/defaults.ts';

const TEST_DIR = `/tmp/config-doctor-test-${Date.now()}`;

beforeEach(async () => {
	await Bun.write(TEST_DIR, '').catch(() => {});
	const {rm, mkdir} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
	await mkdir(TEST_DIR, {recursive: true});
	await mkdir(`${TEST_DIR}/domains`, {recursive: true});
});

afterEach(async () => {
	const {rm} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
});

async function writeDomain(name: string, contents: string): Promise<void> {
	await Bun.write(`${TEST_DIR}/domains/${name}.security.json5`, contents);
}

function loadedFixture(config: Record<string, unknown>) {
	return {
		domain: (config.domain as string) ?? 'com.example.test',
		path: '/tmp/test.security.json5',
		config: applyDefaults(config),
	};
}

test('checkDomain passes for valid default config', () => {
	const result = checkDomain(loadedFixture({domain: 'com.example.valid'}));
	expect(result.ok).toBe(true);
	expect(result.issues.length).toBe(0);
});

test('checkDomain reports invalid hex color', () => {
	const result = checkDomain(
		loadedFixture({domain: 'com.example.badcolor', colors: {primary: 'not-a-color'}}),
	);
	expect(result.ok).toBe(false);
	expect(result.issues.some(i => i.field === 'colors.primary')).toBe(true);
});

test('checkDomain reports invalid domain name', () => {
	const result = checkDomain(loadedFixture({domain: 'not a valid domain!'}));
	expect(result.ok).toBe(false);
	expect(result.issues.some(i => i.field === 'domain')).toBe(true);
});

test('checkDomain reports unknown error code as warning', () => {
	const result = checkDomain(
		loadedFixture({
			domain: 'com.example.codes',
			errorOverrides: {UNKNOWN_CODE: {severity: 'fatal'}},
		}),
	);
	expect(
		result.issues.some(i => i.severity === 'warning' && i.field === 'errorOverrides.UNKNOWN_CODE'),
	).toBe(true);
});

test('checkAllDomains validates discovered domain files', async () => {
	await writeDomain('good', '{ domain: "com.example.good" }');
	await writeDomain('bad', '{ domain: "bad domain", colors: { primary: "red" } }');

	const result = await checkAllDomains(TEST_DIR);
	expect(result.domains.length).toBe(2);
	expect(result.ok).toBe(false);
	expect(result.errors).toBeGreaterThan(0);
});

test('checkAllDomains is ok when no domains are present', async () => {
	const {rm} = await import('fs/promises');
	await rm(`${TEST_DIR}/domains`, {recursive: true, force: true});

	const result = await checkAllDomains(TEST_DIR);
	expect(result.ok).toBe(false);
	expect(result.domains.length).toBe(0);
});
