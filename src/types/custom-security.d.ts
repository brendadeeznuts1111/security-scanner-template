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
	}
}
