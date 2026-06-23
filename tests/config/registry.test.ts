import {expect, test} from 'bun:test';
import {createDomainRegistry} from '../../src/config/registry.ts';

const TEST_DIR = `/tmp/config-registry-test-${Date.now()}`;

test('registry.security returns a bound domain security context', async () => {
	const {mkdir} = await import('fs/promises');
	await mkdir(`${TEST_DIR}/domains`, {recursive: true});
	await Bun.write(
		`${TEST_DIR}/domains/com.example.app.security.json5`,
		'{ domain: "com.example.app" }',
	);

	const registry = createDomainRegistry(TEST_DIR);
	await registry.loadAll();

	const security = await registry.security('com.example.app', 'test-secret');
	expect(security.config.domain).toBe('com.example.app');
	expect(security.csrfSecret).toBe('test-secret');

	const token = security.generateCsrfToken();
	expect(security.verifyCsrfToken(token).valid).toBe(true);

	const digest = await security.digestHex('hello');
	expect(await security.verifyDigest('hello', digest)).toBe(true);

	expect(security.satisfiesVersion('1.2.3', '>=1.0.0 <2.0.0')).toBe(true);
});

test('registry.security reuses cached security contexts', async () => {
	const {mkdir} = await import('fs/promises');
	await mkdir(`${TEST_DIR}/domains`, {recursive: true});
	await Bun.write(
		`${TEST_DIR}/domains/com.example.cached.security.json5`,
		'{ domain: "com.example.cached" }',
	);

	const registry = createDomainRegistry(TEST_DIR);
	await registry.loadAll();

	const first = await registry.security('com.example.cached', 'cache-secret');
	const second = await registry.security('com.example.cached', 'cache-secret');
	expect(first).toBe(second);
});
