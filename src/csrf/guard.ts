export {
	generateToken,
	verifyToken,
	type CsrfErrorCode,
	type CsrfVerifyResult,
} from '../domains/csrf.ts';
export {
	SessionBoundCSRF,
	parseCookies,
	type SessionBoundCsrfConfig,
	type SessionCsrfErrorCode,
	type SessionCsrfVerifyResult,
} from './session-bound.ts';

import type {DomainCsrf} from '../config/types.ts';
import {generateToken, verifyToken} from '../domains/csrf.ts';
import {SessionBoundCSRF} from './session-bound.ts';

/**
 * Per-domain CSRF guard.
 *
 * Uses Bun.CSRF stateless tokens by default. When the domain policy sets
 * `mode: 'session-bound'`, tokens are bound to a session via Bun.CSRF sessionId.
 */
export class CSRFGuard {
	private readonly sessionBound?: SessionBoundCSRF;

	constructor(
		private readonly secret: string,
		private readonly policy: DomainCsrf,
	) {
		if (this.policy.mode === 'session-bound' && secret.length > 0) {
			this.sessionBound = SessionBoundCSRF.fromPolicy(secret, policy);
		}
	}

	generate(sessionId?: string): string {
		if (this.sessionBound) {
			if (!sessionId) {
				throw new Error('Session-bound CSRF requires a sessionId');
			}
			return this.sessionBound.generate(sessionId);
		}
		return generateToken(this.secret, this.policy);
	}

	verify(token: string | null | undefined, sessionId?: string) {
		if (this.sessionBound) {
			return this.sessionBound.verify(token, sessionId ?? null);
		}
		return verifyToken(token, this.secret, this.policy);
	}

	/**
	 * Bun.serve-compatible middleware.
	 */
	async middleware(req: Request, next: () => Promise<Response> | Response): Promise<Response> {
		if (this.sessionBound) {
			return this.sessionBound.middleware(req, next);
		}

		const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
		if (safeMethods.has(req.method)) {
			return next();
		}

		const token = req.headers.get('X-CSRF-Token') ?? null;
		const result = this.verify(token);
		if (!result.valid) {
			return new Response(result.code ?? 'CSRF invalid', {status: 403});
		}
		return next();
	}
}
