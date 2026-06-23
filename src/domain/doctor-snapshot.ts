import path from 'path';
import {mkdir} from 'fs/promises';
import type {DoctorDomainReport, DoctorResult, DoctorTemplateCoverage} from '../config/doctor.ts';
import type {PackageMetadata} from '../config/package-metadata.ts';
import type {DomainBrandingProfile} from './branding.ts';
import type {BundleSnapshot} from './doctor-snapshot-bundles.ts';
import {
	computeDomainFingerprint,
	diffDoctorSnapshotDomains,
	missingRequiredSnapshotSections,
	type DoctorSnapshotConcernsMeta,
	type DoctorSnapshotDomainDiff,
	type DoctorSnapshotEnrichment,
	type DoctorSnapshotFilenameMeta,
	type DoctorSnapshotIssueDelta,
	type DoctorSnapshotPolicyMeta,
	type DoctorSnapshotTemplateDrift,
	type DoctorSnapshotVaultMeta,
} from './doctor-snapshot-deep.ts';
import {withDomainWriteLock, writeSnapshotAtomically} from './doctor-snapshot-write.ts';
import type {PolicySnapshotConfig} from '../policy/types.ts';
import {matrixLayerCounts, type DomainFieldValueRow} from './field-matrix.ts';
import {reverseDnsPathSegment} from './branding.ts';
import {getRuntimeInfo} from '../utils/runtime.ts';
import type {BunSnapshotRuntimeInfo} from '../utils/snapshot-runtime.ts';
import {SemverMatcher} from '../provider/semver-matcher.ts';
import {
	DOCTOR_SNAPSHOT_COMPAT_RANGE,
	DOCTOR_SNAPSHOT_SEMVER,
} from './snapshot-types.ts';
import {DoctorSnapshotV2Schema} from './snapshot-schema.ts';
import {validateSnapshotCompatibility} from './snapshot-compatibility.ts';

export const DOCTOR_SNAPSHOT_VERSION = 2;
export {DOCTOR_SNAPSHOT_SEMVER, DOCTOR_SNAPSHOT_COMPAT_RANGE} from './snapshot-types.ts';
export const DEFAULT_DOCTOR_SNAPSHOT_DIR = '.security/snapshots/doctor';

/** Resolve snapshot storage root (default or `--baseline-dir`). */
export function resolveSnapshotRoot(root: string, baselineDir?: string): string {
	if (!baselineDir?.trim()) {
		return path.join(root, DEFAULT_DOCTOR_SNAPSHOT_DIR);
	}
	return path.isAbsolute(baselineDir) ? baselineDir : path.join(root, baselineDir);
}

export interface DoctorSnapshotIssue {
	field: string;
	severity: 'error' | 'warning';
	code?: string;
}

export interface DoctorSnapshotDomain {
	id: string;
	path: string;
	ok: boolean;
	branding?: DomainBrandingProfile;
	issues: DoctorSnapshotIssue[];
	secretInventoryNames: string[];
	matrix?: Array<Pick<DomainFieldValueRow, 'field' | 'section' | 'value' | 'source'>>;
	layerCounts: ReturnType<typeof matrixLayerCounts>;
	filename: DoctorSnapshotFilenameMeta;
	vault: DoctorSnapshotVaultMeta;
	policy: DoctorSnapshotPolicyMeta;
	concerns: DoctorSnapshotConcernsMeta;
	templateDrift: DoctorSnapshotTemplateDrift[];
	/** Layer 4.5 bundle aggregate hash (spec §16). */
	bundles?: BundleSnapshot | null;
	fingerprint: string;
}

export interface DoctorSnapshotPerDomainFile {
	schema: 'doctor-domain-snapshot';
	version: typeof DOCTOR_SNAPSHOT_VERSION;
	/** Semantic version of the snapshot schema (e.g. "2.0.0"). */
	snapshotVersion: string;
	/** Scanner package version that captured this baseline. */
	scannerVersion?: string;
	capturedAt: string;
	domain: string;
	fingerprint: string;
	bun: {version: string; revision: string};
	snapshotRuntime: BunSnapshotRuntimeInfo;
	domainEntry: DoctorSnapshotDomain;
}

export interface DoctorSnapshotMetadata {
	capturedAt: string;
	bun: {version: string; revision: string};
	package: PackageMetadata | null;
	snapshotRuntime: BunSnapshotRuntimeInfo;
	templateCoverage: DoctorTemplateCoverage;
}

export interface DoctorSnapshotDocument {
	version: typeof DOCTOR_SNAPSHOT_VERSION;
	metadata: DoctorSnapshotMetadata;
	summary: {
		ok: boolean;
		errors: number;
		warnings: number;
		domainCount: number;
	};
	domains: DoctorSnapshotDomain[];
}

export interface DoctorSnapshotCompareResult {
	ok: boolean;
	missing: string[];
	changed: string[];
	extra: string[];
}

export interface DoctorSnapshotPerDomainResult {
	domain: string;
	path: string;
	ok: boolean;
	/** No on-disk baseline for this domain id. */
	missing: boolean;
	/** Domain entry differs from the saved per-domain snapshot. */
	changed: boolean;
	fingerprint: string;
	previousFingerprint?: string;
	changedSections: string[];
	issueDelta?: DoctorSnapshotIssueDelta;
	/** Policy-required sections missing from the current snapshot. */
	missingRequiredSections?: string[];
	/** Baseline semver incompatible with current reader. */
	snapshotVersionWarning?: string;
	snapshotVersion?: string;
	scannerVersion?: string;
	storedScannerVersion?: string;
	compatibility?: import('./snapshot-compatibility.ts').SnapshotCompatibilityResult;
}

export type {DoctorSnapshotDomainDiff, DoctorSnapshotIssueDelta} from './doctor-snapshot-deep.ts';

function sanitizeMatrixValue(row: DomainFieldValueRow): string {
	if (row.section === 'secrets' && row.field !== 'secrets.service') {
		return row.value === '(unset)' ? '(unset)' : '[configured]';
	}
	return row.value;
}

/** Absolute path for a single domain's doctor snapshot file. */
export function domainSnapshotPath(snapshotRoot: string, domain: string): string {
	return path.join(snapshotRoot, `${reverseDnsPathSegment(domain)}.json`);
}

function stableStringify(value: unknown): string {
	return `${JSON.stringify(value, (_key, item) => {
		if (item && typeof item === 'object' && !Array.isArray(item)) {
			return Object.fromEntries(
				Object.keys(item as Record<string, unknown>)
					.sort()
					.map(key => [key, (item as Record<string, unknown>)[key]]),
			);
		}
		return item;
	})}\n`;
}

export function isV1DoctorSnapshot(payload: unknown): boolean {
	if (typeof payload !== 'object' || payload === null) {
		return false;
	}
	const doc = payload as Record<string, unknown>;
	if (doc.schema === 'doctor-domain-snapshot') {
		return false;
	}
	if (doc.version === DOCTOR_SNAPSHOT_VERSION) {
		return false;
	}
	return (
		doc.version === 1 ||
		Array.isArray(doc.domains) ||
		typeof doc.domainEntry === 'object' ||
		!('schema' in doc)
	);
}

export function migrationMessageForDomain(domainId: string): string {
	return `Migrated domain "${domainId}" from v1 to v2`;
}

export function buildDoctorSnapshotDocument(
	result: DoctorResult,
	options: {
		packageMetadata: PackageMetadata | null;
		snapshotRuntime: BunSnapshotRuntimeInfo;
		includeMatrix?: boolean;
	},
): DoctorSnapshotDocument {
	const runtime = getRuntimeInfo();
	const domains: DoctorSnapshotDomain[] = result.domains.map(domain =>
		buildDomainSnapshot(domain, {
			includeMatrix: options.includeMatrix === true,
			enrichment: domain.snapshotEnrichment,
			bundles: domain.bundleSnapshot ?? null,
		}),
	);

	return {
		version: DOCTOR_SNAPSHOT_VERSION,
		metadata: {
			capturedAt: new Date().toISOString(),
			bun: {version: runtime.version, revision: runtime.revision},
			package: options.packageMetadata,
			snapshotRuntime: options.snapshotRuntime,
			templateCoverage: result.templateCoverage,
		},
		summary: {
			ok: result.ok,
			errors: result.errors,
			warnings: result.warnings,
			domainCount: result.domains.length,
		},
		domains,
	};
}

const EMPTY_ENRICHMENT: DoctorSnapshotEnrichment = {
	filename: {expected: '', actual: '', ok: true},
	vault: {present: false, format: 'missing', inventoryCount: 0},
	policy: {
		enabled: false,
		fatal: [],
		warn: [],
		feedSource: 'none',
		tomlAligned: true,
	},
	concerns: {csrfEnabled: false, auditKind: 'none'},
	templateDrift: [],
};

export function buildDomainSnapshot(
	domain: DoctorDomainReport,
	options: {
		includeMatrix?: boolean;
		enrichment?: DoctorSnapshotEnrichment;
		bundles?: BundleSnapshot | null;
	} = {},
): DoctorSnapshotDomain {
	const enrichment = options.enrichment ?? EMPTY_ENRICHMENT;
	const entry: DoctorSnapshotDomain = {
		id: domain.domain,
		path: domain.path,
		ok: domain.ok,
		branding: domain.branding,
		issues: domain.issues.map(issue => ({
			field: issue.field,
			severity: issue.severity,
			code: issue.code,
		})),
		secretInventoryNames: domain.secretInventoryNames ?? [],
		matrix:
			options.includeMatrix && domain.matrix
				? domain.matrix.map(row => ({
						field: row.field,
						section: row.section,
						value: sanitizeMatrixValue(row),
						source: row.source,
					}))
				: undefined,
		layerCounts: matrixLayerCounts(domain.matrix ?? []),
		filename: enrichment.filename,
		vault: enrichment.vault,
		policy: enrichment.policy,
		concerns: enrichment.concerns,
		templateDrift: enrichment.templateDrift,
		bundles: options.bundles ?? null,
		fingerprint: '',
	};
	entry.fingerprint = computeDomainFingerprint(entry);
	return entry;
}

export function doctorSnapshotPaths(snapshotRoot: string, domains: readonly string[]): string[] {
	return domains.map(domain => domainSnapshotPath(snapshotRoot, domain));
}

/** Build a per-domain snapshot document (metadata + single domain entry). */
export function buildPerDomainSnapshotDocument(
	document: DoctorSnapshotDocument,
	domain: DoctorSnapshotDomain,
): DoctorSnapshotDocument {
	return {
		...document,
		summary: {
			...document.summary,
			domainCount: 1,
			ok: domain.ok,
			errors: domain.issues.filter(issue => issue.severity === 'error').length,
			warnings: domain.issues.filter(issue => issue.severity === 'warning').length,
		},
		domains: [domain],
	};
}

export function compareDomainSnapshotEntries(
	current: DoctorSnapshotDomain,
	previous: DoctorSnapshotDomain | null,
): DoctorSnapshotDomainDiff {
	return diffDoctorSnapshotDomains(current, previous);
}

function isPerDomainSnapshotFile(value: unknown): value is DoctorSnapshotPerDomainFile {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as DoctorSnapshotPerDomainFile).schema === 'doctor-domain-snapshot' &&
		typeof (value as DoctorSnapshotPerDomainFile).domainEntry === 'object'
	);
}

export interface SnapshotVersionValidation {
	ok: boolean;
	snapshotVersion?: string;
	message?: string;
}

/** Validate on-disk snapshot semver against the current reader (spec §5). */
export function validateSnapshotSemverVersion(
	payload: unknown,
	requiredRange: string = DOCTOR_SNAPSHOT_COMPAT_RANGE,
	options: {scannerVersion?: string; snapshotPolicy?: PolicySnapshotConfig} = {},
): SnapshotVersionValidation {
	if (!isPerDomainSnapshotFile(payload)) {
		return {ok: true};
	}

	const snapshotVersion =
		typeof payload.snapshotVersion === 'string'
			? payload.snapshotVersion
			: DOCTOR_SNAPSHOT_SEMVER;

	const range = options.snapshotPolicy?.snapshotVersionRange ?? requiredRange;
	if (!SemverMatcher.snapshotCompatible(snapshotVersion, range)) {
		return {
			ok: false,
			snapshotVersion,
			message: `Snapshot version ${snapshotVersion} is incompatible with required range ${range}. Run bun sp doctor --snapshot -u to upgrade.`,
		};
	}

	const storedScannerVersion =
		typeof payload.scannerVersion === 'string' ? payload.scannerVersion : undefined;

	if (options.scannerVersion) {
		const compat = validateSnapshotCompatibility(
			snapshotVersion,
			options.scannerVersion,
			options.snapshotPolicy,
			{storedScannerVersion},
		);
		if (!compat.ok) {
			return {
				ok: false,
				snapshotVersion,
				message: compat.migrationHint
					? `${compat.message} ${compat.migrationHint}`
					: (compat.message ?? 'Snapshot scanner compatibility check failed'),
			};
		}
	}

	const parsed = DoctorSnapshotV2Schema.safeParse({
		...payload,
		snapshotVersion,
	});
	if (!parsed.success) {
		return {
			ok: false,
			snapshotVersion,
			message: `Snapshot schema validation failed: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
		};
	}

	return {ok: true, snapshotVersion};
}

function migrateLegacySnapshotDomain(entry: DoctorSnapshotDomain): DoctorSnapshotDomain {
	if (entry.fingerprint && entry.policy && entry.vault && entry.filename) {
		return {...entry, bundles: entry.bundles ?? null};
	}
	const migrated = buildDomainSnapshot(
		{
			domain: entry.id,
			path: entry.path,
			ok: entry.ok,
			issues: entry.issues.map(issue => ({
				domain: entry.id,
				path: entry.path,
				field: issue.field,
				message: '',
				severity: issue.severity,
				code: issue.code,
			})),
			branding: entry.branding,
			matrix: entry.matrix?.map(row => ({
				field: row.field,
				section: row.section,
				flags: {
					template: false,
					domain: true,
					branding: false,
					service: false,
					secrets: row.section === 'secrets',
				},
				description: row.field,
				value: row.value,
				source: row.source,
			})),
			secretInventoryNames: entry.secretInventoryNames,
		},
		{includeMatrix: Boolean(entry.matrix?.length)},
	);
	migrated.issues = entry.issues;
	migrated.matrix = entry.matrix;
	migrated.layerCounts = entry.layerCounts;
	migrated.fingerprint = computeDomainFingerprint(migrated);
	return migrated;
}

export function normalizeDoctorSnapshotDomainPayload(
	payload: unknown,
): {domain: DoctorSnapshotDomain; migratedFromV1: boolean} | null {
	const migratedFromV1 = isV1DoctorSnapshot(payload);
	if (isPerDomainSnapshotFile(payload)) {
		return {
			domain: migrateLegacySnapshotDomain(payload.domainEntry),
			migratedFromV1,
		};
	}
	if (
		typeof payload === 'object' &&
		payload !== null &&
		Array.isArray((payload as DoctorSnapshotDocument).domains)
	) {
		const entry = (payload as DoctorSnapshotDocument).domains[0];
		return entry
			? {domain: migrateLegacySnapshotDomain(entry), migratedFromV1}
			: null;
	}
	return null;
}

export async function loadPreviousDoctorSnapshotDomain(
	snapshotRoot: string,
	domainId: string,
): Promise<DoctorSnapshotDomain | null> {
	const file = Bun.file(domainSnapshotPath(snapshotRoot, domainId));
	if (!(await file.exists())) {
		return null;
	}
	try {
		const raw = await file.json();
		const versionCheck = validateSnapshotSemverVersion(raw);
		if (!versionCheck.ok) {
			return null;
		}
		return normalizeDoctorSnapshotDomainPayload(raw)?.domain ?? null;
	} catch {
		return null;
	}
}

/** Load snapshot file and surface semver compatibility warnings. */
export async function loadSnapshotWithVersionCheck(
	snapshotRoot: string,
	domainId: string,
	options: {
		requiredRange?: string;
		scannerVersion?: string;
		snapshotPolicy?: PolicySnapshotConfig;
	} = {},
): Promise<{
	domain: DoctorSnapshotDomain | null;
	versionWarning?: string;
	snapshotVersion?: string;
	scannerVersion?: string;
	storedScannerVersion?: string;
	compatibility?: import('./snapshot-compatibility.ts').SnapshotCompatibilityResult;
}> {
	const filePath = domainSnapshotPath(snapshotRoot, domainId);
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		return {domain: null};
	}
	try {
		const raw = await file.json();
		const storedScannerVersion =
			typeof (raw as {scannerVersion?: string}).scannerVersion === 'string'
				? (raw as {scannerVersion: string}).scannerVersion
				: undefined;
		const snapshotVersion =
			typeof (raw as {snapshotVersion?: string}).snapshotVersion === 'string'
				? (raw as {snapshotVersion: string}).snapshotVersion
				: DOCTOR_SNAPSHOT_SEMVER;
		const versionCheck = validateSnapshotSemverVersion(
			raw,
			options.requiredRange ?? DOCTOR_SNAPSHOT_COMPAT_RANGE,
			{
				scannerVersion: options.scannerVersion,
				snapshotPolicy: options.snapshotPolicy,
			},
		);
		const compatibility =
			options.scannerVersion && options.snapshotPolicy
				? validateSnapshotCompatibility(
						snapshotVersion,
						options.scannerVersion,
						options.snapshotPolicy,
						{storedScannerVersion},
					)
				: undefined;
		const normalized = normalizeDoctorSnapshotDomainPayload(raw);
		return {
			domain: normalized?.domain ?? null,
			versionWarning: versionCheck.ok ? undefined : versionCheck.message,
			snapshotVersion,
			scannerVersion: options.scannerVersion,
			storedScannerVersion,
			compatibility: compatibility?.ok === false ? compatibility : undefined,
		};
	} catch {
		return {domain: null};
	}
}

/** Compare each domain against its on-disk per-domain snapshot file. */
export async function compareDoctorSnapshotsPerDomain(
	document: DoctorSnapshotDocument,
	snapshotRoot: string,
	options: {policy?: PolicySnapshotConfig; scannerVersion?: string} = {},
): Promise<DoctorSnapshotPerDomainResult[]> {
	const results: DoctorSnapshotPerDomainResult[] = [];

	const requiredRange = options.policy?.snapshotVersionRange ?? DOCTOR_SNAPSHOT_COMPAT_RANGE;

	for (const domain of document.domains) {
		const loaded = await loadSnapshotWithVersionCheck(snapshotRoot, domain.id, {
			requiredRange,
			scannerVersion: options.scannerVersion,
			snapshotPolicy: options.policy,
		});
		const previous = loaded.domain;
		const comparison = compareDomainSnapshotEntries(domain, previous);
		const missingRequiredSections = options.policy?.requiredSections?.length
			? missingRequiredSnapshotSections(domain, options.policy.requiredSections)
			: [];
		results.push({
			domain: domain.id,
			path: domainSnapshotPath(snapshotRoot, domain.id),
			ok:
				comparison.ok &&
				missingRequiredSections.length === 0 &&
				!loaded.versionWarning,
			missing: comparison.missing,
			changed: comparison.changed,
			fingerprint: comparison.fingerprint,
			previousFingerprint: comparison.previousFingerprint,
			changedSections: comparison.sections,
			issueDelta: comparison.issueDelta,
			missingRequiredSections:
				missingRequiredSections.length > 0 ? missingRequiredSections : undefined,
			snapshotVersionWarning: loaded.versionWarning,
			snapshotVersion: loaded.snapshotVersion,
			scannerVersion: loaded.scannerVersion,
			storedScannerVersion: loaded.storedScannerVersion,
			compatibility: loaded.compatibility,
		});
	}

	return results;
}

export async function writeDoctorSnapshots(
	snapshotRoot: string,
	document: DoctorSnapshotDocument,
	options: {scannerVersion?: string} = {},
): Promise<string[]> {
	const written: string[] = [];
	await mkdir(snapshotRoot, {recursive: true});

	for (const domain of document.domains) {
		const outPath = domainSnapshotPath(snapshotRoot, domain.id);
		const perDomainFile: DoctorSnapshotPerDomainFile = {
			schema: 'doctor-domain-snapshot',
			version: DOCTOR_SNAPSHOT_VERSION,
			snapshotVersion: DOCTOR_SNAPSHOT_SEMVER,
			scannerVersion: options.scannerVersion,
			capturedAt: document.metadata.capturedAt,
			domain: domain.id,
			fingerprint: domain.fingerprint,
			bun: document.metadata.bun,
			snapshotRuntime: document.metadata.snapshotRuntime,
			domainEntry: domain,
		};
		const body = stableStringify(perDomainFile);
		await withDomainWriteLock(domain.id, () => writeSnapshotAtomically(outPath, body));
		written.push(outPath);
	}

	const indexPath = path.join(snapshotRoot, 'index.json');
	await writeSnapshotAtomically(indexPath, stableStringify(document));
	written.push(indexPath);
	return written;
}

/** Patch bundle section on an existing per-domain baseline (spec §16.3). */
export async function patchDomainSnapshotBundles(
	snapshotRoot: string,
	domainId: string,
	bundles: BundleSnapshot,
): Promise<string | null> {
	const outPath = domainSnapshotPath(snapshotRoot, domainId);
	const file = Bun.file(outPath);
	if (!(await file.exists())) {
		return null;
	}

	const raw = (await file.json()) as DoctorSnapshotPerDomainFile | DoctorSnapshotDocument | unknown;
	const normalized = normalizeDoctorSnapshotDomainPayload(raw);
	if (!normalized) {
		return null;
	}

	const entry = normalized.domain;
	entry.bundles = bundles;
	entry.fingerprint = computeDomainFingerprint(entry);

	const prior = isPerDomainSnapshotFile(raw) ? raw : null;
	const perDomainFile: DoctorSnapshotPerDomainFile = {
		schema: 'doctor-domain-snapshot',
		version: DOCTOR_SNAPSHOT_VERSION,
		snapshotVersion: prior?.snapshotVersion ?? DOCTOR_SNAPSHOT_SEMVER,
		capturedAt: new Date().toISOString(),
		domain: domainId,
		fingerprint: entry.fingerprint,
		bun: prior?.bun ?? {version: Bun.version, revision: ''},
		snapshotRuntime: prior?.snapshotRuntime ?? {
			nativeFlags: ['--update-snapshots', '-u'],
			matcherAvailable: true,
			updateRequested: false,
		},
		domainEntry: entry,
	};

	const body = stableStringify(perDomainFile);
	await withDomainWriteLock(domainId, () => writeSnapshotAtomically(outPath, body));
	return outPath;
}

export async function readDoctorSnapshotFile(
	filePath: string,
): Promise<DoctorSnapshotDocument | null> {
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		return null;
	}
	try {
		return (await file.json()) as DoctorSnapshotDocument;
	} catch {
		return null;
	}
}

export function compareDoctorSnapshots(
	current: DoctorSnapshotDocument,
	previous: DoctorSnapshotDocument,
): DoctorSnapshotCompareResult {
	const currentIds = new Set(current.domains.map(domain => domain.id));
	const previousIds = new Set(previous.domains.map(domain => domain.id));

	const missing = [...previousIds].filter(id => !currentIds.has(id));
	const extra = [...currentIds].filter(id => !previousIds.has(id));
	const changed: string[] = [];

	for (const id of currentIds) {
		if (!previousIds.has(id)) {
			continue;
		}
		const left = current.domains.find(domain => domain.id === id);
		const right = previous.domains.find(domain => domain.id === id);
		if (!left || !right) {
			continue;
		}
		if (stableStringify(left) !== stableStringify(right)) {
			changed.push(id);
		}
	}

	return {
		ok: missing.length === 0 && extra.length === 0 && changed.length === 0,
		missing,
		changed,
		extra,
	};
}

export async function loadPreviousDoctorSnapshotIndex(
	snapshotRoot: string,
): Promise<DoctorSnapshotDocument | null> {
	return readDoctorSnapshotFile(path.join(snapshotRoot, 'index.json'));
}
