import {expect, test, beforeEach, afterEach} from 'bun:test';
import path from 'path';
import {rm} from 'fs/promises';
import {emitOperatorIssue, OPERATOR_LOG_ENV} from '../../src/logging/operator-log.ts';

const ROOT = `/tmp/operator-log-test-${Date.now()}`;

beforeEach(async () => {
	await rm(ROOT, {recursive: true, force: true}).catch(() => {});
	process.env[OPERATOR_LOG_ENV] = '1';
});

afterEach(async () => {
	await rm(ROOT, {recursive: true, force: true}).catch(() => {});
	delete process.env[OPERATOR_LOG_ENV];
});

test('emitOperatorIssue writes master and domain mirror jsonl', async () => {
	const enriched = await emitOperatorIssue(ROOT, {
		domain: 'com.example.log',
		path: path.join(ROOT, 'domains/com.example.log.security.json5'),
		field: 'secrets.service',
		message: 'service mismatch',
		severity: 'error',
		code: 'SECRETS_SERVICE_MISMATCH',
	});

	const masterPath = path.join(ROOT, '.security/operator.jsonl');
	const mirrorPath = path.join(ROOT, '.security/com.example.log/issues.jsonl');
	const master = (await Bun.file(masterPath).text()).trim().split('\n');
	const mirror = (await Bun.file(mirrorPath).text()).trim().split('\n');

	expect(master.length).toBe(1);
	expect(mirror.length).toBe(1);
	const event = JSON.parse(master[0] ?? '{}') as {
		scope: string;
		logSegment: string;
		code: string;
		location: string;
		mirror: string;
	};
	expect(event.scope).toBe('domain');
	expect(event.logSegment).toBe('com.example.log');
	expect(event.code).toBe('SECRETS_SERVICE_MISMATCH');
	expect(event.location).toBe('secrets.service');
	expect(event.mirror).toBe(mirrorPath);
	expect(enriched.channel).toBe('vault');
});

test('emitOperatorIssue writes core/lib mirror for peer meta issues', async () => {
	await emitOperatorIssue(ROOT, {
		domain: 'supply-chain',
		path: path.join(ROOT, 'node_modules/foo/package.json'),
		field: 'dependencies.foo.peerDependenciesMeta',
		message: 'implicit optional peer',
		severity: 'warning',
		code: 'IMPLICIT_OPTIONAL_PEER',
	});

	const mirrorPath = path.join(ROOT, '.security/lib/issues.jsonl');
	const lines = (await Bun.file(mirrorPath).text()).trim().split('\n');
	const event = JSON.parse(lines[0] ?? '{}') as {scope: string; coreSegment: string};
	expect(event.scope).toBe('core');
	expect(event.coreSegment).toBe('lib');
});
