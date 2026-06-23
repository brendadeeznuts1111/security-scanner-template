export type DigestAlgorithm = 'sha256' | 'sha384' | 'sha512' | 'md5' | 'sha1';

async function toBuffer(input: Blob | ArrayBuffer | Uint8Array | string): Promise<ArrayBuffer> {
	if (input instanceof Blob) {
		return input.arrayBuffer();
	}
	if (typeof input === 'string') {
		return new TextEncoder().encode(input).buffer as ArrayBuffer;
	}
	if (input instanceof ArrayBuffer) {
		return input;
	}
	const slice = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
	return slice as ArrayBuffer;
}

/**
 * Compute a hex digest using Bun.CryptoHasher.
 */
export async function digestHex(
	input: Blob | ArrayBuffer | Uint8Array | string,
	algorithm: DigestAlgorithm = 'sha256',
): Promise<string> {
	const buffer = await toBuffer(input);
	const hasher = new Bun.CryptoHasher(algorithm);
	hasher.update(buffer);
	return hasher.digest('hex');
}

/**
 * Synchronous hex digest for in-memory payloads.
 */
export function digestHexSync(
	input: ArrayBuffer | Uint8Array | string,
	algorithm: DigestAlgorithm = 'sha256',
): string {
	const buffer: ArrayBuffer =
		typeof input === 'string'
			? (new TextEncoder().encode(input).buffer as ArrayBuffer)
			: input instanceof ArrayBuffer
				? input
				: (input.buffer.slice(
						input.byteOffset,
						input.byteOffset + input.byteLength,
					) as ArrayBuffer);
	const hasher = new Bun.CryptoHasher(algorithm);
	hasher.update(buffer);
	return hasher.digest('hex');
}

/**
 * Compare a payload digest against an expected hex string.
 */
export async function verifyDigest(
	input: Blob | ArrayBuffer | Uint8Array | string,
	expectedHex: string,
	algorithm: DigestAlgorithm = 'sha256',
): Promise<boolean> {
	const actual = await digestHex(input, algorithm);
	return actual === expectedHex.toLowerCase();
}

/**
 * Match a package version against a semver range from a threat feed rule.
 */
export function satisfiesVersion(version: string, range: string): boolean {
	return Bun.semver.satisfies(version, range);
}
