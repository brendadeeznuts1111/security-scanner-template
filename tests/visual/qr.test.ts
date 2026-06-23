import {expect, test} from 'bun:test';
import {mkdtemp, rm} from 'fs/promises';
import path from 'path';
import os from 'node:os';
import {isImageAvailable, QRGenerator} from '../../src/visual/index.ts';

test('QRGenerator.generate returns a PNG data URL', async () => {
	const dataUrl = await QRGenerator.generate('https://example.com/token');
	expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
});

test('QRGenerator.toImage produces a Bun.Image', async () => {
	if (!isImageAvailable()) {
		expect(true).toBe(true);
		return;
	}

	const image = await QRGenerator.toImage('audit-entry-123');
	const metadata = await image.metadata();
	expect(metadata.width).toBeGreaterThan(0);
	expect(metadata.height).toBeGreaterThan(0);
});

test('QRGenerator.toSvg returns SVG markup', async () => {
	const svg = await QRGenerator.toSvg('ledger-token', {dark: '#FF453A', light: '#0A0A0F'});
	expect(svg).toContain('<svg');
	expect(svg).toContain('#FF453A');
	expect(svg).toContain('#0A0A0F');
});

test('QRGenerator.toTerminal returns ASCII blocks', async () => {
	const art = await QRGenerator.toTerminal('ledger-token');
	expect(art.length).toBeGreaterThan(10);
	expect(art).toMatch(/[█▀▄ ]/);
});

test('QRGenerator.write saves SVG by default format', async () => {
	const dir = await mkdtemp(path.join(os.tmpdir(), 'visual-qr-svg-'));
	const dest = path.join(dir, 'token.svg');

	try {
		await QRGenerator.write('token-value', dest, 'svg', {dark: '#111111', light: '#EEEEEE'});
		const text = await Bun.file(dest).text();
		expect(text).toContain('<svg');
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
});

test('QRGenerator.save writes a PNG file', async () => {
	const dir = await mkdtemp(path.join(os.tmpdir(), 'visual-qr-'));
	const dest = path.join(dir, 'token.png');

	try {
		await QRGenerator.save('https://example.com/audit/token', dest);
		expect(Bun.file(dest).size).toBeGreaterThan(0);
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
});
