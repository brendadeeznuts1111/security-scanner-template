import {expect, test} from 'bun:test';
import {parseCookies, SessionBoundCSRF} from '../../src/csrf/session-bound.ts';

const secret = 'domain-specific-secret';

test('generate and verify round-trip for a session', () => {
	const csrf = new SessionBoundCSRF(secret);
	const token = csrf.generate('session-123');

	expect(token.length).toBeGreaterThan(0);
	expect(csrf.verify(token, 'session-123')).toEqual({valid: true});
});

test('verify rejects token from a different session', () => {
	const csrf = new SessionBoundCSRF(secret);
	const token = csrf.generate('session-a');

	expect(csrf.verify(token, 'session-b')).toEqual({
		valid: false,
		code: 'CSRF_MISMATCH',
	});
});

test('verify rejects missing session', () => {
	const csrf = new SessionBoundCSRF(secret);
	expect(csrf.verify('token', undefined)).toEqual({
		valid: false,
		code: 'CSRF_SESSION_MISSING',
	});
});

test('parseCookies decodes cookie header', () => {
	expect(parseCookies('_session=abc123; _csrf=deadbeef')).toEqual({
		_session: 'abc123',
		_csrf: 'deadbeef',
	});
});

test('middleware allows safe methods without a token', async () => {
	const csrf = new SessionBoundCSRF(secret);
	const response = await csrf.middleware(new Request('http://localhost/'), () => new Response('ok'));

	expect(response.status).toBe(200);
	expect(await response.text()).toBe('ok');
});

test('middleware blocks POST without a valid token', async () => {
	const csrf = new SessionBoundCSRF(secret);
	const response = await csrf.middleware(
		new Request('http://localhost/submit', {
			method: 'POST',
			headers: {cookie: '_session=session-1'},
		}),
		() => new Response('ok'),
	);

	expect(response.status).toBe(403);
});

test('middleware allows POST with a valid session-bound token', async () => {
	const csrf = new SessionBoundCSRF(secret);
	const sessionId = 'session-42';
	const token = csrf.generate(sessionId);

	const response = await csrf.middleware(
		new Request('http://localhost/submit', {
			method: 'POST',
			headers: {
				cookie: `_session=${sessionId}`,
				'X-CSRF-Token': token,
			},
		}),
		() => new Response('submitted'),
	);

	expect(response.status).toBe(200);
	expect(await response.text()).toBe('submitted');
});