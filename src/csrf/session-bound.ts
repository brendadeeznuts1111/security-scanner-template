import {generateToken, verifyToken, type CsrfVerifyResult} from '../domains/csrf.ts';
import type {DomainCsrf} from '../config/types.ts';

export type SessionCsrfErrorCode = 'CSRF_MISSING' | 'CSRF_MISMATCH' | 'CSRF_SESSION_MISSING';
export type SessionCsrfVerifyResult = CsrfVerifyResult;

export interface SessionBoundCsrfConfig {
	secret: string;
	cookieName?: string;
	headerName?: string;
	sessionCookieName?: string;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Parse a Cookie header into a name/value map.
 */
export function parseCookies(cookieHeader: string): Record<string, string> {
	const cookies: Record<string, string> = {};

	for (const pair of cookieHeader.split(';')) {
		const trimmed = pair.trim();
		if (trimmed.length === 0) continue;

		const separator = trimmed.indexOf('=');
		if (separator <= 0) continue;

		const key = trimmed.slice(0, separator).trim();
		const value = trimmed.slice(separator + 1).trim();
		if (key.length > 0) {
			cookies[key] = decodeURIComponent(value);
		}
	}

	return cookies;
}

/**
 * Session-bound CSRF middleware backed by Bun.CSRF with sessionId binding.
 */
export class SessionBoundCSRF {
	readonly cookieName: string;
	readonly headerName: string;
	readonly sessionCookieName: string;
	private readonly policy: DomainCsrf;

	constructor(
		private readonly secret: string,
		config: Omit<SessionBoundCsrfConfig, 'secret'> & {policy?: DomainCsrf} = {},
	) {
		if (secret.length === 0) {
			throw new Error('Session-bound CSRF requires a non-empty secret');
		}

		this.cookieName = config.cookieName ?? '_csrf';
		this.headerName = config.headerName ?? 'X-CSRF-Token';
		this.sessionCookieName = config.sessionCookieName ?? '_session';
		this.policy = config.policy ?? {enabled: true, tokenLength: 1, mode: 'session-bound'};
	}

	static fromPolicy(secret: string, policy: DomainCsrf): SessionBoundCSRF {
		return new SessionBoundCSRF(secret, {
			cookieName: policy.cookieName,
			headerName: policy.headerName,
			sessionCookieName: policy.sessionCookieName,
			policy,
		});
	}

	/**
	 * Generate a CSRF token bound to a session ID via Bun.CSRF.
	 */
	generate(sessionId: string): string {
		if (sessionId.length === 0) {
			throw new Error('Session ID must be non-empty');
		}

		return generateToken(this.secret, this.policy, sessionId);
	}

	/**
	 * Verify a submitted token against the session ID via Bun.CSRF.
	 */
	verify(
		token: string | null | undefined,
		sessionId: string | null | undefined,
	): SessionCsrfVerifyResult {
		return verifyToken(token, this.secret, this.policy, sessionId ?? undefined);
	}

	/**
	 * Extract the session ID and CSRF token from a request.
	 */
	extractFromRequest(req: Request): {sessionId: string | null; token: string | null} {
		const cookies = parseCookies(req.headers.get('cookie') ?? '');
		return {
			sessionId: cookies[this.sessionCookieName] ?? null,
			token: req.headers.get(this.headerName) ?? cookies[this.cookieName] ?? null,
		};
	}

	/**
	 * Build a Set-Cookie header for the CSRF token.
	 */
	buildCsrfCookie(token: string): string {
		return `${this.cookieName}=${encodeURIComponent(token)}; Path=/; SameSite=Strict`;
	}

	/**
	 * Issue a session-bound token and cookie header for the given session.
	 */
	issueForSession(sessionId: string): {token: string; cookieHeader: string} {
		const token = this.generate(sessionId);
		return {
			token,
			cookieHeader: this.buildCsrfCookie(token),
		};
	}

	/**
	 * Bun.serve-compatible middleware. Safe methods pass through; mutating
	 * methods require a valid session-bound token.
	 */
	async middleware(
		req: Request,
		next: () => Promise<Response> | Response,
	): Promise<Response> {
		if (SAFE_METHODS.has(req.method)) {
			return next();
		}

		const {sessionId, token} = this.extractFromRequest(req);
		const result = this.verify(token, sessionId);
		if (!result.valid) {
			const status = result.code === 'CSRF_SESSION_MISSING' ? 401 : 403;
			const message =
				result.code === 'CSRF_SESSION_MISSING'
					? 'Session missing'
					: 'CSRF token invalid or bound to different session';
			return new Response(message, {status});
		}

		return next();
	}
}