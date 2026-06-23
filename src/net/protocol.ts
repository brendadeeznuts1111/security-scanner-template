import type {FeedFetchProtocol} from '../config/types.ts';

export type {FeedFetchProtocol};

/**
 * Resolve the HTTP client protocol for threat-feed fetches.
 *
 * Precedence: explicit config → `FEED_FETCH_PROTOCOL` env →
 * `BUN_FEATURE_FLAG_EXPERIMENTAL_HTTP3_CLIENT=1` (http3).
 */
export function resolveFeedProtocol(
	configured?: FeedFetchProtocol,
	env: Record<string, string | undefined> = process.env,
): FeedFetchProtocol | undefined {
	if (configured === 'http2' || configured === 'http3') {
		return configured;
	}

	const fromEnv = env.FEED_FETCH_PROTOCOL;
	if (fromEnv === 'http2' || fromEnv === 'http3') {
		return fromEnv;
	}

	if (env.BUN_FEATURE_FLAG_EXPERIMENTAL_HTTP3_CLIENT === '1') {
		return 'http3';
	}

	return undefined;
}
