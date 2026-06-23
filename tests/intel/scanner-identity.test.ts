import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, rmSync} from 'fs';
import path from 'path';
import {tmpdir} from 'os';
import {formatPackageAuthor, parsePackageAuthor} from '../../src/config/package-metadata.ts';
import {resolveSupplyChainScanIdentity} from '../../src/intel/scanner-identity.ts';

test('parsePackageAuthor normalizes string and object forms', () => {
	expect(parsePackageAuthor('Acme Team <security@acme.example.com> (https://acme.corp)')).toEqual({
		name: 'Acme Team',
		email: 'security@acme.example.com',
		url: 'https://acme.corp',
	});
	expect(
		parsePackageAuthor({
			name: 'Acme Corp Security Team',
			email: 'security@acme.example.com',
			url: 'https://acme.corp/security',
		}),
	).toEqual({
		name: 'Acme Corp Security Team',
		email: 'security@acme.example.com',
		url: 'https://acme.corp/security',
	});
	expect(formatPackageAuthor(parsePackageAuthor('Jane Doe <jane@example.com>'))).toBe(
		'Jane Doe <jane@example.com>',
	);
});

describe('resolveSupplyChainScanIdentity', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'scan-identity-'));
	const scannerRoot = path.join(root, 'scanner');
	const targetRoot = path.join(root, 'target');

	beforeEach(() => {
		mkdirSync(scannerRoot, {recursive: true});
		mkdirSync(targetRoot, {recursive: true});
		Bun.write(
			path.join(scannerRoot, 'package.json'),
			JSON.stringify({
				name: '@acme/bun-security-scanner',
				version: '1.0.0',
				author: {
					name: 'Acme Corp Security Team',
					email: 'security@acme.example.com',
				},
			}),
		);
		Bun.write(
			path.join(targetRoot, 'package.json'),
			JSON.stringify({
				name: 'sports-terminal-os',
				version: '0.4.2',
				author: 'Sports Terminal Maintainers <ops@sports.example>',
			}),
		);
	});

	afterEach(() => {
		rmSync(root, {recursive: true, force: true});
	});

	test('collects scanner and target author identity', async () => {
		const identity = await resolveSupplyChainScanIdentity({
			scannerRoot,
			projectRoot: targetRoot,
			capturedAt: '2026-06-23T12:00:00.000Z',
		});
		expect(identity).toContainKeys(['capturedAt', 'bun', 'scanner', 'target']);
		expect(identity.capturedAt).toBe('2026-06-23T12:00:00.000Z');
		expect(identity.bun).toContainKeys(['version', 'revision', 'main']);
		expect(identity.scanner).toContainKeys(['name', 'version', 'author']);
		expect(identity.scanner.name).toBe('@acme/bun-security-scanner');
		expect(identity.scanner.version).toBe('1.0.0');
		expect(identity.scanner.author).toContain('Acme Corp Security Team');
		expect(identity.target?.name).toBe('sports-terminal-os');
		expect(identity.target?.author).toContain('Sports Terminal Maintainers');
		expect(identity.bun.version).toBe(Bun.version);
	});
});
