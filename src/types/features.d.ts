/**
 * Type-safe registry for Bun's compile-time feature flags.
 *
 * @see https://bun.com/docs/bundler#feature-flags
 */
declare module 'bun:bundle' {
	interface Registry {
		features:
			| 'AUDIT_SQLITE'
			| 'AUDIT_JSONL'
			| 'INTEL_DNS'
			| 'REPORT_MARKDOWN'
			| 'REPORT_HTML'
			| 'CACHE_REDIS'
			| 'FEED_WEBSOCKET'
			| 'SCAN_EXTERNAL'
			| 'DEBUG'
			| 'MOCK_API';
	}

	export function feature(name: Registry['features']): boolean;
}
