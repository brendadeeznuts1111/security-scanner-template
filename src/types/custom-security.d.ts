/**
 * Project-specific augmentations on top of `bun-types`.
 *
 * Prefer native Bun types for Terminal, Image, WebView, JSON5, JSONL, secrets,
 * and spawn — do not redeclare them here (conflicts with `tsc`).
 */
export {};

declare global {
	interface ServeOptions {
		http3?: boolean;
		http1?: boolean;
		tls?: {
			cert: string | Bun.BunFile;
			key: string | Bun.BunFile;
			ca?: string | Bun.BunFile;
		};
	}

	interface Process {
		/**
		 * Replace the current process with a new program (Bun 1.4+).
		 * @see https://bun.com/docs/runtime/child-process#execve
		 */
		execve?(path: string, argv: string[], env?: Record<string, string>): never;
	}

	const __FEATURE_AUDIT_SQLITE__: boolean | undefined;
	const __FEATURE_AUDIT_JSONL__: boolean | undefined;
	const __FEATURE_INTEL_DNS__: boolean | undefined;
	const __FEATURE_REPORT_MARKDOWN__: boolean | undefined;
	const __FEATURE_REPORT_HTML__: boolean | undefined;
	const __FEATURE_CACHE_REDIS__: boolean | undefined;
	const __FEATURE_FEED_WEBSOCKET__: boolean | undefined;
	const __FEATURE_SCAN_EXTERNAL__: boolean | undefined;
	const __FEATURE_DEBUG__: boolean | undefined;
	const __FEATURE_MOCK_API__: boolean | undefined;

	namespace Bun {
		namespace Security {
			interface Advisory {
				categories?: string[];
				hashVerified?: boolean;
				cve?: string;
				version?: string;
			}

			interface Package {
				resolved?: string;
				integrity?: string;
				isDependency?: boolean;
				isDevDependency?: boolean;
				isPeerDependency?: boolean;
				isOptionalDependency?: boolean;
				isIndirectDependency?: boolean;
				isBundledDependency?: boolean;
				isTransitiveDependency?: boolean;
				isRootDependency?: boolean;
				isDependencyOfDependency?: boolean;
				isDependencyOfDevDependency?: boolean;
				isDependencyOfPeerDependency?: boolean;
				isDependencyOfOptionalDependency?: boolean;
				isDependencyOfBundledDependency?: boolean;
				isDependencyOfTransitiveDependency?: boolean;
				isDependencyOfRootDependency?: boolean;
				isDependencyOfDependencyOfDependency?: boolean;
				isDependencyOfDependencyOfDevDependency?: boolean;
				isDependencyOfDependencyOfPeerDependency?: boolean;
				isDependencyOfDependencyOfOptionalDependency?: boolean;
				isDependencyOfDependencyOfBundledDependency?: boolean;
				isDependencyOfDependencyOfTransitiveDependency?: boolean;
				isDependencyOfDependencyOfRootDependency?: boolean;
			}
		}
	}
}
