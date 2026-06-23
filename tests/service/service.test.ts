import {expect, test, afterEach} from 'bun:test';
import {applyDefaults} from '../../src/config/defaults.ts';
import {createDomainSecurity} from '../../src/config/security.ts';
import {CSRFGuard} from '../../src/csrf/guard.ts';

let server: ReturnType<typeof Bun.serve> | null = null;

afterEach(() => {
	server?.stop(true);
	server = null;
});

test('CSRFGuard enforces session-bound CSRF on mutating requests', async () => {
	const config = applyDefaults({
		domain: 'com.example.session-csrf-test',
		csrf: {
			enabled: true,
			tokenLength: 32,
			mode: 'session-bound',
		},
	});

	const csrf = new CSRFGuard('test-secret', config.csrf);
	const sessionId = 'user-session-1';
	const token = csrf.generate(sessionId);

	server = Bun.serve({
		port: 0,
		hostname: '127.0.0.1',
		fetch: req => csrf.middleware(req, () => Response.json({ok: true})),
	});

	const base = `http://${server.hostname}:${server.port}`;

	const noSession = await fetch(`${base}/submit`, {method: 'POST'});
	expect(noSession.status).toBe(401);

	const blocked = await fetch(`${base}/submit`, {
		method: 'POST',
		headers: {cookie: `_session=${sessionId}`},
	});
	expect(blocked.status).toBe(403);

	const allowed = await fetch(`${base}/submit`, {
		method: 'POST',
		headers: {
			cookie: `_session=${sessionId}`,
			'X-CSRF-Token': token,
		},
	});
	expect(allowed.status).toBe(200);
});

test('createDomainSecurity supports session-bound mode via Bun.CSRF', async () => {
	const config = applyDefaults({
		domain: 'com.example.bound',
		csrf: {
			enabled: true,
			tokenLength: 32,
			mode: 'session-bound',
			encoding: 'hex',
			algorithm: 'sha256',
		},
	});

	const security = await createDomainSecurity(config, 'bound-secret');
	const token = security.generateCsrfToken('sess-1');
	expect(security.verifyCsrfToken(token, 'sess-1')).toEqual({valid: true});
	expect(security.verifyCsrfToken(token, 'sess-2').valid).toBe(false);
});