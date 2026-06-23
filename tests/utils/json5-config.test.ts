import {expect, test} from 'bun:test';
import {mkdirSync, readFileSync, rmSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';
import {
	BUN_JSON5_DOCS_URL,
	isJson5Available,
	parseJson5File,
	parseJson5Text,
	stringifyJson5,
	writeJson5File,
} from '../../src/utils/json5-config.ts';

function tempDir(): string {
	return join(tmpdir(), `json5-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

test('isJson5Available reports Bun.JSON5.parse and stringify', () => {
	expect(isJson5Available()).toBe(true);
});

test('BUN_JSON5_DOCS_URL points at bun.com', () => {
	expect(BUN_JSON5_DOCS_URL).toContain('bun.com');
	expect(BUN_JSON5_DOCS_URL).toContain('json5');
});

test('parseJson5Text accepts comments and trailing commas', () => {
	const parsed = parseJson5Text<{domain: string; enabled: boolean}>(`{
		// comment
		domain: 'com.example.app',
		enabled: true,
	}`);
	expect(parsed.domain).toBe('com.example.app');
	expect(parsed.enabled).toBe(true);
});

test('writeJson5File and parseJson5File round-trip', async () => {
	const dir = tempDir();
	mkdirSync(dir, {recursive: true});
	const filePath = join(dir, 'network-baseline.json5');
	const document = {
		version: 1,
		domain: 'com.example.app',
		endpoints: ['/health'],
	};

	await writeJson5File(filePath, document);
	const loaded = await parseJson5File<typeof document>(filePath);
	expect(loaded.domain).toBe('com.example.app');
	expect(stringifyJson5(loaded)).toContain('com.example.app');

	const raw = readFileSync(filePath, 'utf8');
	expect(raw.endsWith('\n')).toBe(true);

	rmSync(dir, {recursive: true, force: true});
});