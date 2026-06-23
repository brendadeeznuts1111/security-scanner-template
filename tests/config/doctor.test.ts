import {expect, test, beforeEach, afterEach} from 'bun:test';
import {checkAllDomains, checkDomain, domainReportOk} from '../../src/config/doctor.ts';
import {applyDefaults} from '../../src/config/defaults.ts';
import {clearSystemCACache, seedSystemCACacheForTests} from '../../src/intel/tls/system-ca.ts';

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

test('checkDomain reports secrets.service drift after defaults merge', () => {
	const config = applyDefaults({
		domain: 'com.example.secrets',
		csrf: {enabled: false, tokenLength: 32},
	});
	config.secrets.service = 'com.other.service';
	const result = checkDomain({
		domain: config.domain,
		path: '/tmp/test.security.json5',
		config,
	});
	expect(result.ok).toBe(false);
	expect(
		result.issues.some(i => i.field === 'secrets.service' && i.code === 'SECRETS_SERVICE_MISMATCH'),
	).toBe(true);
});

test('checkAllDomains reports public secrets.service override mismatch', async () => {
	await writeDomain(
		'mismatch',
		`{
			domain: "com.example.mismatch",
			secrets: { service: "com.other.override", inventory: [] },
			csrf: { enabled: false, tokenLength: 32 },
		}`,
	);

	const result = await checkAllDomains(TEST_DIR);
	const domain = result.domains.find(d => d.domain === 'com.example.mismatch');
	expect(domain?.ok).toBe(false);
	expect(
		domain?.issues.some(
			i => i.field === 'secrets.service' && i.message.includes('com.other.override'),
		),
	).toBe(true);
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

test('checkDomain reports unsupported password algorithm', () => {
	const result = checkDomain(
		loadedFixture({
			domain: 'com.example.password',
			identity: {algorithm: 'md5', minLength: 8, requireSpecialChar: true},
		}),
	);
	expect(result.ok).toBe(false);
	expect(result.issues.some(i => i.field === 'identity.algorithm')).toBe(true);
});

test('checkDomain reports invalid bcrypt cost', () => {
	const result = checkDomain(
		loadedFixture({
			domain: 'com.example.password',
			identity: {algorithm: 'bcrypt', minLength: 8, requireSpecialChar: true, cost: 50},
		}),
	);
	expect(result.ok).toBe(false);
	expect(result.issues.some(i => i.field === 'identity.cost')).toBe(true);
});

test('checkAllDomains validates discovered domain files', async () => {
	await writeDomain('good', '{ domain: "com.example.good" }');
	await writeDomain('bad', '{ domain: "bad domain", colors: { primary: "red" } }');

	const result = await checkAllDomains(TEST_DIR);
	expect(result.domains.length).toBe(2);
	expect(result.ok).toBe(false);
	expect(result.errors).toBeGreaterThan(0);
	expect(result.runtime.apisOk).toBe(true);
	expect(result.runtime.crossRef.ok).toBe(true);
	expect(result.runtime.version).toBe(Bun.version);
	expect(result.runtime.systemCA.platform).toBe(process.platform);
	expect(result.runtime.terminalIO.bunVersion).toBe(Bun.version);
	expect(result.runtime.platform.bunVersion).toBe(Bun.version);
	expect(typeof result.runtime.platform.bunTypesTsgoCompatible).toBe('boolean');
	expect(Array.isArray(result.peerMetaIssues)).toBe(true);
});

test('checkDomain warns when system CA is available but tls.useSystemCA is explicitly false', () => {
	clearSystemCACache();
	seedSystemCACacheForTests(['-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----']);

	const result = checkDomain(
		loadedFixture({domain: 'com.example.tls-doctor', tls: {useSystemCA: false}}),
	);
	expect(
		result.issues.some(i => i.code === 'SYSTEM_CA_AVAILABLE' && i.field === 'tls.useSystemCA'),
	).toBe(true);

	clearSystemCACache();
});

test('checkDomain does not warn when system CA auto-validation applies', () => {
	clearSystemCACache();
	seedSystemCACacheForTests(['-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----']);

	const result = checkDomain(loadedFixture({domain: 'com.example.tls-auto'}));
	expect(result.issues.some(i => i.code === 'SYSTEM_CA_AVAILABLE')).toBe(false);

	clearSystemCACache();
});

test('checkDomain does not warn when tls.useSystemCA is enabled', () => {
	clearSystemCACache();
	seedSystemCACacheForTests(['-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----']);

	const result = checkDomain(
		loadedFixture({domain: 'com.example.tls-enabled', tls: {useSystemCA: true}}),
	);
	expect(result.issues.some(i => i.code === 'SYSTEM_CA_AVAILABLE')).toBe(false);

	clearSystemCACache();
});

test('checkAllDomains includes template coverage and branding profiles', async () => {
	await writeDomain('profiled', '{ domain: "com.example.profiled", displayName: "Profiled App" }');

	const result = await checkAllDomains(TEST_DIR);
	expect(result.templateCoverage.ok).toBe(true);
	expect(result.templateCoverage.catalogFields).toBeGreaterThanOrEqual(60);
	const domain = result.domains.find(d => d.domain === 'com.example.profiled');
	expect(domain?.branding?.displayName).toBe('Profiled App');
	expect(domain?.branding?.service).toBe('com.example.profiled');
});

test('checkAllDomains writes doctor snapshots with --update-snapshots semantics', async () => {
	await writeDomain('snap', '{ domain: "com.example.snap", displayName: "Snap" }');
	await Bun.write(
		`${TEST_DIR}/package.json`,
		JSON.stringify({name: 'doctor-snapshot-test', version: '1.0.0'}),
	);

	const result = await checkAllDomains(TEST_DIR, {
		snapshot: true,
		updateSnapshots: true,
		argv: ['bun', 'doctor', '--update-snapshots'],
	});
	expect(result.snapshot?.updateRequested).toBe(true);
	expect(result.snapshot?.written.length).toBeGreaterThan(0);
	expect(result.packageMetadata?.name).toBeTruthy();
});

test('checkAllDomains collects matrix rows when matrix option is enabled', async () => {
	await writeDomain('matrix', '{ domain: "com.example.matrix" }');

	const result = await checkAllDomains(TEST_DIR, {matrix: true, matrixSection: 'branding'});
	expect(result.matrix?.template.length).toBeGreaterThan(0);
	expect(result.matrix?.domains['com.example.matrix']?.length).toBeGreaterThan(0);
	expect(
		result.domains.find(d => d.domain === 'com.example.matrix')?.matrix?.length,
	).toBeGreaterThan(0);
});

test('domainReportOk allows warnings but rejects errors', () => {
	expect(
		domainReportOk([
			{
				domain: 'com.example.warn',
				path: '/tmp/x.security.json5',
				field: 'tls.useSystemCA',
				message: 'warning only',
				severity: 'warning',
			},
		]),
	).toBe(true);
	expect(
		domainReportOk([
			{
				domain: 'com.example.bad',
				path: '/tmp/x.security.json5',
				field: 'domain',
				message: 'error',
				severity: 'error',
			},
		]),
	).toBe(false);
});

test('checkAllDomains is ok when no domains are present', async () => {
	const {rm} = await import('fs/promises');
	await rm(`${TEST_DIR}/domains`, {recursive: true, force: true});

	const result = await checkAllDomains(TEST_DIR);
	expect(result.ok).toBe(false);
	expect(result.domains.length).toBe(0);
});
