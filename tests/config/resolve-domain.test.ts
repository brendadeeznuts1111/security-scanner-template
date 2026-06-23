import {expect, test, beforeEach, afterEach} from 'bun:test';
import {mkdir, mkdtemp, rm} from 'fs/promises';
import path from 'path';
import os from 'node:os';
import {loadDomainReportContext, resolveProjectDomain} from '../../src/config/resolve-domain.ts';

let root = '';

beforeEach(async () => {
	root = await mkdtemp(path.join(os.tmpdir(), 'resolve-domain-'));
});

afterEach(async () => {
	delete process.env.SP_DOMAIN;
	await rm(root, {recursive: true, force: true}).catch(() => {});
});

test('resolveProjectDomain returns sole domains file domain', async () => {
	await mkdir(`${root}/domains`, {recursive: true});
	await Bun.write(`${root}/domains/app.security.json5`, '{ domain: "com.example.sole" }');

	expect(await resolveProjectDomain(root)).toBe('com.example.sole');
});

test('resolveProjectDomain prefers SP_DOMAIN when multiple domain files exist', async () => {
	await mkdir(`${root}/domains`, {recursive: true});
	await Bun.write(`${root}/domains/a.security.json5`, '{ domain: "com.example.a" }');
	await Bun.write(`${root}/domains/b.security.json5`, '{ domain: "com.example.b" }');
	process.env.SP_DOMAIN = 'com.example.b';

	expect(await resolveProjectDomain(root)).toBe('com.example.b');
});

test('loadDomainReportContext loads merged config', async () => {
	await mkdir(`${root}/domains`, {recursive: true});
	await Bun.write(
		`${root}/domains/ledger.security.json5`,
		'{ domain: "com.example.ledger", displayName: "Ledger" }',
	);

	const ctx = await loadDomainReportContext(root);
	expect(ctx?.domain).toBe('com.example.ledger');
	expect(ctx?.config.displayName).toBe('Ledger');
	expect(ctx?.config.ops.report.operatorQr?.enabled).toBe(true);
});
