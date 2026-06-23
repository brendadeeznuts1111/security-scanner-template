import {expect, test, afterEach} from 'bun:test';
import {mkdir, rm} from 'fs/promises';
import path from 'path';
import {createDomainRegistry} from '../../src/config/registry.ts';

const TEST_ROOT = `/tmp/registry-watch-${Date.now()}`;

afterEach(async () => {
	await rm(TEST_ROOT, {recursive: true, force: true}).catch(() => {});
});

test('reloadDomain adds and updates domain configs', async () => {
	await mkdir(`${TEST_ROOT}/domains`, {recursive: true});
	const filePath = `${TEST_ROOT}/domains/com.example.reload.security.json5`;

	await Bun.write(filePath, '{ domain: "com.example.reload", displayName: "Reload v1" }');

	const registry = createDomainRegistry(TEST_ROOT);
	await registry.loadAll();
	expect(registry.get('com.example.reload').displayName).toBe('Reload v1');

	await Bun.write(filePath, '{ domain: "com.example.reload", displayName: "Reload v2" }');
	const changed = await registry.reloadDomain(filePath);
	expect(changed).toEqual({
		type: 'changed',
		domain: 'com.example.reload',
		path: filePath,
	});
	expect(registry.get('com.example.reload').displayName).toBe('Reload v2');
});

test('reloadDomain removes deleted configs', async () => {
	await mkdir(`${TEST_ROOT}/domains`, {recursive: true});
	const filePath = `${TEST_ROOT}/domains/com.example.removed.security.json5`;

	await Bun.write(filePath, '{ domain: "com.example.removed" }');

	const registry = createDomainRegistry(TEST_ROOT);
	await registry.loadAll();
	expect(registry.has('com.example.removed')).toBe(true);

	await rm(filePath);
	const removed = await registry.reloadDomain(filePath);
	expect(removed?.type).toBe('removed');
	expect(registry.has('com.example.removed')).toBe(false);
});

test('watch registers fs watcher without throwing', async () => {
	await mkdir(`${TEST_ROOT}/domains`, {recursive: true});
	await Bun.write(
		`${TEST_ROOT}/domains/com.example.watch.security.json5`,
		'{ domain: "com.example.watch" }',
	);

	const registry = createDomainRegistry(TEST_ROOT);
	await registry.loadAll();

	const events: string[] = [];
	registry.watch({
		debounceMs: 100,
		onReload: event => events.push(`${event.type}:${event.domain}`),
	});

	const filePath = path.join(TEST_ROOT, 'domains', 'com.example.watch.security.json5');
	await Bun.write(filePath, '{ domain: "com.example.watch", displayName: "hot" }');
	await Bun.sleep(250);

	registry.unwatch();
	expect(events.length).toBeGreaterThan(0);
	expect(events.some(entry => entry.endsWith('com.example.watch'))).toBe(true);
});