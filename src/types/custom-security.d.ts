export {};

// Example extension of Bun.Security via declaration merging.
// TypeScript automatically merges these interfaces with the ones in
// bun-security.d.ts — no modification of the original file needed.
//
// Uncomment the fields you want to use, or add your own.
declare global {
	namespace Bun {
		namespace Security {
			interface Advisory {
				/** Threat categories that triggered this advisory (e.g. ["malware"]). */
				categories?: string[];
				/** Whether the tarball hash was verified before reporting. */
				hashVerified?: boolean;
			}

			interface Package {
				/** Resolved registry URL for the package, if available. */
				resolved?: string;
				/** Subresource integrity hash, if available. */
				integrity?: string;
			}
		}

		// Bun.secrets is a newer runtime API not yet present in @types/bun@1.2.x.
		// Declared here so the scanner can use it without waiting on an upstream
		// types release. See https://bun.com/docs/runtime/secrets.
		//
		// Both the object form `get({service, name})` and the positional form
		// `get(service, name)` are supported at runtime; both overloads are
		// declared here so consumers can use either style.
		interface Secrets {
			get(options: {service: string; name: string}): Promise<string | null>;
			get(service: string, name: string): Promise<string | null>;
			set(options: {
				service: string;
				name: string;
				value: string;
				allowUnrestrictedAccess?: boolean;
			}): Promise<void>;
			set(service: string, name: string, value: string): Promise<void>;
			delete(options: {service: string; name: string}): Promise<boolean>;
			delete(service: string, name: string): Promise<boolean>;
		}

		const secrets: Secrets;
	}
}
