import path from 'path';
import type {IntegrityHasher} from '../../integrity/hasher.ts';
import type {TranspilerScanResult} from './types.ts';

export interface IntegrityManifest {
	/** Relative path from scan root → expected sha256 hex digest. */
	files: Record<string, string>;
}

const MANIFEST_DIR = '.security/integrity';

function domainManifestFilename(domain: string): string {
	return `${domain.replaceAll('.', '-')}.json`;
}

/** Load per-domain integrity manifest when present. */
export async function loadIntegrityManifest(
	root: string,
	domain?: string,
): Promise<IntegrityManifest | null> {
	if (!domain) return null;

	const manifestPath = path.join(root, MANIFEST_DIR, domainManifestFilename(domain));
	const file = Bun.file(manifestPath);
	if (!(await file.exists())) {
		return null;
	}

	try {
		const parsed = (await file.json()) as IntegrityManifest;
		if (typeof parsed !== 'object' || parsed === null || typeof parsed.files !== 'object') {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

export interface IntegrityCheckResult {
	hash: string;
	expected?: string;
	mismatch: boolean;
	finding?: TranspilerScanResult;
}

/** Hash file content and compare against manifest entry when available. */
export function verifyFileIntegrity(
	hasher: IntegrityHasher,
	source: string,
	relativePath: string,
	manifest: IntegrityManifest | null,
	filePath: string,
): IntegrityCheckResult {
	const hash = hasher.digestSync(source);
	const expected = manifest?.files[relativePath];

	if (!expected) {
		return {hash, mismatch: false};
	}

	const mismatch = hasher.digestSync(source) !== expected.toLowerCase();
	if (!mismatch) {
		return {hash, expected, mismatch: false};
	}

	return {
		hash,
		expected,
		mismatch: true,
		finding: {
			type: 'transpiler',
			file: filePath,
			ruleId: 'integrity-mismatch',
			severity: 'critical',
			message: `File hash mismatch — possible tampering (${relativePath})`,
			hash,
			hashExpected: expected,
			integrityMismatch: true,
			category: 'malware',
		},
	};
}
