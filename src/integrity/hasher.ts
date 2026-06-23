export {
	digestHex,
	digestHexSync,
	verifyDigest,
	satisfiesVersion,
	type DigestAlgorithm,
} from '../crypto/integrity.ts';

import {digestHex, digestHexSync, verifyDigest, type DigestAlgorithm} from '../crypto/integrity.ts';

/**
 * Stateless integrity hasher for package and payload verification.
 */
export class IntegrityHasher {
	digest(input: Blob | ArrayBuffer | Uint8Array | string, algorithm?: DigestAlgorithm) {
		return digestHex(input, algorithm);
	}

	digestSync(input: ArrayBuffer | Uint8Array | string, algorithm?: DigestAlgorithm) {
		return digestHexSync(input, algorithm);
	}

	verify(input: Blob | ArrayBuffer | Uint8Array | string, expectedHex: string, algorithm?: DigestAlgorithm) {
		return verifyDigest(input, expectedHex, algorithm);
	}
}
