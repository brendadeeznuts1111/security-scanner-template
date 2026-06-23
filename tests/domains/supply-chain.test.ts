import {expect, test, beforeEach, afterEach} from 'bun:test';
import * as supplyChain from '../../src/domains/supply-chain.ts';
import {startFeedServer} from '../helpers.ts';

beforeEach(() => {
	supplyChain.deactivate();
});

afterEach(() => {
	supplyChain.deactivate();
});

test('activate returns a provider', () => {
	const provider = supplyChain.activate({});
	expect(provider.version).toBe('1');
	expect(provider.scan).toBeFunction();
});

test('scanPackage returns advisories for a known malicious package', async () => {
	supplyChain.activate({});
	const advisories = await supplyChain.scanPackage('event-stream', '3.3.6');

	expect(advisories.length).toBeGreaterThan(0);
	expect(advisories[0]).toMatchObject({
		level: 'fatal',
		package: 'event-stream',
		version: '3.3.6',
	});
});

test('scanPackage uses configured remote feed', async () => {
	const {server, url} = startFeedServer([
		{
			package: 'domain-pkg',
			range: '1.0.0',
			url: 'https://example.com/domain-pkg',
			description: 'Domain test',
			categories: ['malware'],
		},
	]);

	supplyChain.activate({
		feed: {remote: url, cacheTtl: 0},
	});

	const advisories = await supplyChain.scanPackage('domain-pkg', '1.0.0');
	expect(advisories).toMatchObject([
		{
			level: 'fatal',
			package: 'domain-pkg',
			version: '1.0.0',
		},
	]);

	server.stop(true);
});

test('setSeverityPolicy overrides default categorization', async () => {
	supplyChain.activate({});
	supplyChain.setSeverityPolicy({
		fatal: ['malware'],
		warn: ['deprecated'],
	});

	const advisories = await supplyChain.scanPackage('deprecated-example', '1.0.0');
	expect(advisories).toMatchObject([{level: 'warn', package: 'deprecated-example'}]);
});

test('recordDecision and audit buffer decisions', async () => {
	supplyChain.activate({});

	await supplyChain.recordDecision({
		package: 'event-stream',
		version: '3.3.6',
		requestedRange: '^3.3.0',
		advisories: [],
		allowed: false,
		decidedAt: new Date().toISOString(),
	});

	const all = await supplyChain.audit();
	expect(all.length).toBe(1);
	expect(all[0]?.package).toBe('event-stream');
});

test('audit filters by hours since', async () => {
	supplyChain.activate({});

	await supplyChain.recordDecision({
		package: 'old-pkg',
		version: '1.0.0',
		requestedRange: '1.0.0',
		advisories: [],
		allowed: true,
		decidedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
	});

	await supplyChain.recordDecision({
		package: 'new-pkg',
		version: '1.0.0',
		requestedRange: '1.0.0',
		advisories: [],
		allowed: true,
		decidedAt: new Date().toISOString(),
	});

	const recent = await supplyChain.audit(24);
	expect(recent.length).toBe(1);
	expect(recent[0]?.package).toBe('new-pkg');
});

test('doctor reports activation status', async () => {
	expect(await supplyChain.doctor()).toEqual({
		activated: false,
		feedConfigured: false,
	});

	supplyChain.activate({
		feed: {local: './rules/security-rules.json'},
	});

	const status = await supplyChain.doctor();
	expect(status.activated).toBe(true);
	expect(status.feedConfigured).toBe(true);
	expect(status.feedReachable).toBe(true);
});

test('scanPackage dryRun option downgrades fatal advisories', async () => {
	supplyChain.activate({});
	const advisories = await supplyChain.scanPackage('event-stream', '3.3.6', {dryRun: true});

	expect(advisories.length).toBeGreaterThan(0);
	expect(advisories[0]).toMatchObject({
		level: 'warn',
		package: 'event-stream',
		version: '3.3.6',
	});
});

test('activate dryRun option applies to scanPackage', async () => {
	supplyChain.activate({dryRun: true});
	const advisories = await supplyChain.scanPackage('event-stream', '3.3.6');

	expect(advisories.length).toBeGreaterThan(0);
	expect(advisories[0]?.level).toBe('warn');
});

test('report generates HTML with operator QR when domain is configured', async () => {
	const originalSecrets = Bun.secrets;
	const store: Record<string, string> = {};
	(Bun as unknown as {secrets: unknown}).secrets = {
		get: async (opts: {service: string; name: string}) =>
			store[`${opts.service}/${opts.name}`] ?? null,
		set: async (opts: {service: string; name: string; value: string}) => {
			store[`${opts.service}/${opts.name}`] = opts.value;
		},
		delete: async () => false,
	};

	const {mkdir, rm} = await import('fs/promises');
	const root = `/tmp/sc-report-${Date.now()}`;
	try {
		await mkdir(`${root}/domains`, {recursive: true});
		await Bun.write(
			`${root}/domains/test.security.json5`,
			'{ domain: "com.example.sc-report", ops: { report: { operatorQr: { enabled: true } } } }',
		);
		await Bun.secrets.set({
			service: 'com.example.sc-report',
			name: 'vault-master-key',
			value: 'sc-report-token',
		});

		supplyChain.activate({domain: 'com.example.sc-report'});
		const html = await supplyChain.report('html', undefined, {root});
		expect(html).toContain('operator-qr');
		expect(html).toContain('com.example.sc-report');
	} finally {
		(Bun as unknown as {secrets: unknown}).secrets = originalSecrets;
		await rm(root, {recursive: true, force: true}).catch(() => {});
		supplyChain.deactivate();
	}
});

test('report generates JSON from audit buffer', async () => {
	supplyChain.activate({});
	await supplyChain.recordDecision({
		package: 'event-stream',
		version: '3.3.6',
		requestedRange: '^3.3.0',
		advisories: [
			{
				level: 'fatal',
				package: 'event-stream',
				version: '3.3.6',
				url: null,
				description: 'Malicious',
				categories: ['malware'],
			},
		],
		allowed: false,
		decidedAt: new Date().toISOString(),
	});

	const json = await supplyChain.report('json');
	const parsed = JSON.parse(json);
	expect(parsed.fatalCount).toBe(1);
	expect(parsed.advisories[0]?.package).toBe('event-stream');
});

test('sqlite audit sink persists decisions across reactivations', async () => {
	const auditPath = `/tmp/scanner-audit-${crypto.randomUUID()}.sqlite`;
	const masterKey = 'test-audit-key';

	try {
		supplyChain.activate({
			auditLog: auditPath,
			auditMasterKey: masterKey,
		});

		await supplyChain.recordDecision({
			package: 'sqlite-audited-pkg',
			version: '1.0.0',
			requestedRange: '1.0.0',
			advisories: [],
			allowed: true,
			decidedAt: new Date().toISOString(),
		});

		supplyChain.deactivate();
		supplyChain.activate({
			auditLog: auditPath,
			auditMasterKey: masterKey,
		});

		const all = await supplyChain.audit();
		expect(all.length).toBe(1);
		expect(all[0]?.package).toBe('sqlite-audited-pkg');
	} finally {
		await Bun.file(auditPath)
			.delete()
			.catch(() => {});
		supplyChain.deactivate();
	}
});

test('encrypted audit sink persists decisions across reactivations', async () => {
	const auditPath = `/tmp/scanner-audit-${crypto.randomUUID()}.jsonl.enc`;
	const masterKey = 'test-audit-key';

	try {
		supplyChain.activate({
			auditLog: auditPath,
			auditMasterKey: masterKey,
		});

		await supplyChain.recordDecision({
			package: 'audited-pkg',
			version: '1.0.0',
			requestedRange: '1.0.0',
			advisories: [],
			allowed: true,
			decidedAt: new Date().toISOString(),
		});

		// Reactivate to clear the in-memory buffer and prove persistence.
		supplyChain.deactivate();
		supplyChain.activate({
			auditLog: auditPath,
			auditMasterKey: masterKey,
		});

		const all = await supplyChain.audit();
		expect(all.length).toBe(1);
		expect(all[0]?.package).toBe('audited-pkg');
	} finally {
		await Bun.file(auditPath)
			.delete()
			.catch(() => {});
		supplyChain.deactivate();
	}
});
