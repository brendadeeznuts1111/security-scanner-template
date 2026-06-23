import {expect, test} from 'bun:test';
import {mkdir, mkdtemp, rm} from 'fs/promises';
import path from 'path';
import {tmpdir} from 'os';
import {createDomainRegistry} from '../../src/config/registry.ts';

async function withRegistryFixture(
	run: (root: string) => Promise<void>,
): Promise<void> {
	const root = await mkdtemp(path.join(tmpdir(), 'registry-watch-'));
	try {
		await mkdir(path.join(root, 'domains'), {recursive: true});
		await run(root);
	} finally {
		await rm(root, {recursive: true, force: true}).catch(() => {});
	}
}

test('reloadDomain adds and updates domain configs', async () => {
	await withRegistryFixture(async root => {
		const filePath = path.join(root, 'domains', 'com.example.reload.security.json5');

		await Bun.write(filePath, '{ domain: "com.example.reload", displayName: "Reload v1" }');

		const registry = createDomainRegistry(root);
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
});

test('reloadDomain removes deleted configs', async () => {
	await withRegistryFixture(async root => {
		const filePath = path.join(root, 'domains', 'com.example.removed.security.json5');

		await Bun.write(filePath, '{ domain: "com.example.removed" }');

		const registry = createDomainRegistry(root);
		await registry.loadAll();
		expect(registry.has('com.example.removed')).toBe(true);

		await rm(filePath);
		const removed = await registry.reloadDomain(filePath);
		expect(removed?.type).toBe('removed');
		expect(registry.has('com.example.removed')).toBe(false);
	});
});

test('reloadDomain reports error and evicts stale domain when load fails', async () => {
	await withRegistryFixture(async root => {
		const filePath = path.join(root, 'domains', 'com.example.broken.security.json5');

		await Bun.write(filePath, '{ domain: "com.example.broken", displayName: "v1" }');

		const registry = createDomainRegistry(root);
		await registry.loadAll();
		expect(registry.get('com.example.broken').displayName).toBe('v1');

		await Bun.write(filePath, 'not-valid-json5 {{{');
		const event = await registry.reloadDomain(filePath);
		expect(event?.type).toBe('error');
		expect(event?.domain).toBe('com.example.broken');
		expect(event?.path).toBe(filePath);
		expect(event?.error).toMatch(/parse/i);
		expect(registry.has('com.example.broken')).toBe(false);
	});
});

test('watch registers fs watcher without throwing', async () => {
	await withRegistryFixture(async root => {
		const filePath = path.join(root, 'domains', 'com.example.watch.security.json5');
		await Bun.write(filePath, '{ domain: "com.example.watch" }');

		const registry = createDomainRegistry(root);
		await registry.loadAll();

		const events: string[] = [];
		registry.watch({
			debounceMs: 50,
			onReload: event => events.push(`${event.type}:${event.domain}`),
		});

		await Bun.sleep(50);
		await Bun.write(filePath, '{ domain: "com.example.watch", displayName: "hot" }');
		const deadline = Date.now() + 5_000;
		while (events.length === 0 && Date.now() < deadline) {
			await Bun.sleep(100);
		}

		registry.unwatch();
		expect(events.length).toBeGreaterThan(0);
		expect(events.some(entry => entry.endsWith('com.example.watch'))).toBe(true);
	});
});