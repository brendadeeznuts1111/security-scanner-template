import {expect, test} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {buildServeInit, resolveServeOptions} from '../../src/service/serve-options.ts';

test('resolveServeOptions merges domain service config with CLI overrides', () => {
	const config = applyDefaults({
		domain: 'com.example.serve',
		service: {
			port: 8443,
			http3: true,
			http1: true,
			tls: {cert: './certs/server.pem', key: './certs/server-key.pem'},
		},
		csrf: {enabled: false, tokenLength: 32},
	});

	const resolved = resolveServeOptions(config, {port: 9443});
	expect(resolved.port).toBe(9443);
	expect(resolved.http3).toBe(true);
	expect(resolved.http1).toBe(true);
	expect(resolved.tls?.cert).toContain('certs/server.pem');
});

test('buildServeInit passes http3 and http1 to Bun.serve shape', async () => {
	const init = buildServeInit(
		{http3: true, http1: false, tls: {cert: '/tmp/cert.pem', key: '/tmp/key.pem'}},
		() => new Response('ok'),
	);

	expect(init.http3).toBe(true);
	expect(init.http1).toBe(false);
	expect(init.tls?.cert).toBe('/tmp/cert.pem');
	const response = await Promise.resolve(init.fetch(new Request('http://test')));
	expect(response).toBeInstanceOf(Response);
});
