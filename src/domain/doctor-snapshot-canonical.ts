/**
 * Canonical serialization for deterministic doctor snapshot fingerprints (spec §12).
 *
 * - Object keys sorted lexicographically
 * - Arrays preserve order
 * - `undefined` omitted; `null` sections serialize as `""`
 * - Numbers as plain JSON numbers
 */

export function canonicalSerialize(value: unknown): string {
	if (value === null) {
		return '""';
	}
	if (value === undefined) {
		return '';
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return JSON.stringify(value);
	}
	if (typeof value === 'string') {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		const items = value.map(item => canonicalSerialize(item));
		return `[${items.join(',')}]`;
	}
	if (typeof value === 'object') {
		const record = value as Record<string, unknown>;
		const keys = Object.keys(record).sort();
		const pairs: string[] = [];
		for (const key of keys) {
			const item = record[key];
			if (item === undefined) continue;
			pairs.push(`${JSON.stringify(key)}:${canonicalSerialize(item)}`);
		}
		return `{${pairs.join(',')}}`;
	}
	return JSON.stringify(value);
}

/** SHA-256 hex digest of canonically joined sections (spec §12.1). */
export function fingerprintFromSections(sections: readonly unknown[]): string {
	const hasher = new Bun.CryptoHasher('sha256');
	hasher.update(sections.map(section => canonicalSerialize(section)).join('|'));
	return hasher.digest('hex');
}
