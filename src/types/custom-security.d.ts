export {};

// Example extension of Bun.Security via declaration merging.
// TypeScript automatically merges these interfaces with the ones in
// bun-security.d.ts — no modification of the original file needed.
//
// Bun.secrets is a newer runtime API not yet present in the bun-types version
// pinned by this project, so it is also declared here. The runtime accepts both
// set(options, value) and set({service, name, value}); call sites use the latter.
// See https://bun.com/docs/runtime/secrets.
declare module 'bun' {
	const JSON5: {
		parse(text: string): unknown;
	};

	interface ParseChunkResult<T = unknown> {
		values: T[];
		read: number;
		done: boolean;
		error: SyntaxError | null;
	}

	const JSONL: {
		parse<T = unknown>(input: string | ArrayBufferLike | TypedArray | DataView<ArrayBuffer>): T[];
		parseChunk<T = unknown>(
			input: string | ArrayBufferLike | TypedArray | DataView<ArrayBuffer>,
			start?: number,
			end?: number,
		): ParseChunkResult<T>;
	};
}

declare global {
	namespace Bun {
		namespace Security {
			interface Advisory {
				/** Threat categories that triggered this advisory (e.g. ["malware"]). */
				categories?: string[];
				/** Whether the tarball hash was verified before reporting. */
				hashVerified?: boolean;
				/** CVE identifier associated with the advisory, if available. */
				cve?: string;
				/** Package version the advisory applies to, if available. */
				version?: string;
			}

			interface Package {
				/** Resolved registry URL for the package, if available. */
				resolved?: string;
				/** Subresource integrity hash of the package tarball, if available. */
				integrity?: string;
				/** Whether the package is a direct dependency of the project. */
				isDependency?: boolean;
				/** Whether the package is a dev dependency of the project. */
				isDevDependency?: boolean;
				/** Whether the package is a peer dependency of the project. */
				isPeerDependency?: boolean;
				/** Whether the package is an optional dependency of the project. */
				isOptionalDependency?: boolean;
				/** Whether the package is an indirect dependency of the project. */
				isIndirectDependency?: boolean;
				/** Whether the package is a bundled dependency of the project. */
				isBundledDependency?: boolean;
				/** Whether the package is a transitive dependency of the project. */
				isTransitiveDependency?: boolean;
				/** Whether the package is a root dependency of the project. */
				isRootDependency?: boolean;
				/** Whether the package is a dependency of a dependency. */
				isDependencyOfDependency?: boolean;
				/** Whether the package is a dependency of a dev dependency. */
				isDependencyOfDevDependency?: boolean;
				/** Whether the package is a dependency of a peer dependency. */
				isDependencyOfPeerDependency?: boolean;
				/** Whether the package is a dependency of an optional dependency. */
				isDependencyOfOptionalDependency?: boolean;
				/** Whether the package is a dependency of a bundled dependency. */
				isDependencyOfBundledDependency?: boolean;
				/** Whether the package is a dependency of a transitive dependency. */
				isDependencyOfTransitiveDependency?: boolean;
				/** Whether the package is a dependency of a root dependency. */
				isDependencyOfRootDependency?: boolean;
				/** Whether the package is a dependency of a dependency of a dependency. */
				isDependencyOfDependencyOfDependency?: boolean;
				/** Whether the package is a dependency of a dependency of a dev dependency. */
				isDependencyOfDependencyOfDevDependency?: boolean;
				/** Whether the package is a dependency of a dependency of a peer dependency. */
				isDependencyOfDependencyOfPeerDependency?: boolean;
				/** Whether the package is a dependency of a dependency of an optional dependency. */
				isDependencyOfDependencyOfOptionalDependency?: boolean;
				/** Whether the package is a dependency of a dependency of a bundled dependency. */
				isDependencyOfDependencyOfBundledDependency?: boolean;
				/** Whether the package is a dependency of a dependency of a transitive dependency. */
				isDependencyOfDependencyOfTransitiveDependency?: boolean;
				/** Whether the package is a dependency of a dependency of a root dependency. */
				isDependencyOfDependencyOfRootDependency?: boolean;
			}
		}

		/**
		 * Base options for all secrets operations.
		 * @experimental
		 */
		interface SecretsOptions {
			/** Service or application name (e.g. "com.acme.scanner"). */
			service: string;
			/** Account or key identifier. */
			name: string;
		}

		/**
		 * Extended options for set() when the value is passed inside the object.
		 * @experimental
		 */
		interface SecretsSetOptions extends SecretsOptions {
			/** The secret value to store. */
			value: string;
			/**
			 * Whether any process running as the same user may read the credential.
			 * Defaults to false. Platform support varies (most meaningful on Windows).
			 */
			allowUnrestrictedAccess?: boolean;
		}

		/**
		 * Runtime secrets API interface.
		 * @experimental
		 */
		interface Secrets {
			/** Retrieve a credential. Returns null if not found. */
			get(options: SecretsOptions): Promise<string | null>;
			/** Store a credential (value inside the options object). */
			set(options: SecretsSetOptions): Promise<void>;
			/** Store a credential (value as a separate argument). */
			set(options: SecretsOptions, value: string): Promise<void>;
			/** Delete a credential. Returns true if a credential was deleted. */
			delete(options: SecretsOptions): Promise<boolean>;
		}

		/**
		 * Runtime secrets API for storing and retrieving sensitive data.
		 * @experimental This API is experimental and may change in future versions.
		 */
		const secrets: Secrets;
	}
}
