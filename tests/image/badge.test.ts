import {expect, test, beforeEach, afterEach} from 'bun:test';
import {rm} from 'fs/promises';
import {applyDefaults} from '../../src/config/defaults.ts';
import {solidPng} from '../../src/image/png-solid.ts';
import {writeDomainBadge} from '../../src/image/badge.ts';

const OUT_DIR = '.security/badges-test';

beforeEach(async () => {
	await rm(OUT_DIR, {recursive: true, force: true});
});

afterEach(async () => {
	await rm(OUT_DIR, {recursive: true, force: true});
});

test('solidPng encodes a valid PNG signature', () => {
	const png = solidPng(8, 8, 255, 0, 0);
	expect(png[0]).toBe(0x89);
	expect(String.fromCharCode(png[1]!, png[2]!, png[3]!)).toBe('PNG');
});

test('writeDomainBadge writes a Bun.Image PNG for the domain primary color', async () => {
	const config = applyDefaults({
		domain: 'com.example.badge',
		displayName: 'Badge Test',
		colors: {primary: '#0A84FF'},
		csrf: {enabled: false, tokenLength: 32},
	});

	const path = await writeDomainBadge(config, {outDir: OUT_DIR, size: 32});
	const file = Bun.file(path);
	expect(await file.exists()).toBe(true);
	expect(file.size).toBeGreaterThan(0);
});