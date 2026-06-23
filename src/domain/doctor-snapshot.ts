import path from 'path';
import {mkdir} from 'fs/promises';
import type {DoctorDomainReport, DoctorResult, DoctorTemplateCoverage} from '../config/doctor.ts';
import type {PackageMetadata} from '../config/package-metadata.ts';
import type {DomainBrandingProfile} from './branding.ts';
import {matrixLayerCounts, type DomainFieldValueRow} from './field-matrix.ts';
import {reverseDnsPathSegment} from './branding.ts';
import {getRuntimeInfo} from '../utils/runtime.ts';
import type {BunSnapshotRuntimeInfo} from '../utils/snapshot-runtime.ts';

export const DOCTOR_SNAPSHOT_VERSION = 1;
export const DEFAULT_DOCTOR_SNAPSHOT_DIR = '.security/snapshots/doctor';

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

function sanitizeMatrixValue(row: DomainFieldValueRow): string {
	if (row.section === 'secrets' && row.field !== 'secrets.service') {
		return row.value === '(unset)' ? '(unset)' : '[configured]';
	}
	return row.value;
}

function domainSnapshotPath(root: string, domain: string): string {
	return path.join(root, DEFAULT_DOCTOR_SNAPSHOT_DIR, `${reverseDnsPathSegment(domain)}.json`);
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
		buildDomainSnapshot(domain, options.includeMatrix === true),
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

export function buildDomainSnapshot(
	domain: DoctorDomainReport,
	includeMatrix = false,
): DoctorSnapshotDomain {
	return {
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
			includeMatrix && domain.matrix
				? domain.matrix.map(row => ({
						field: row.field,
						section: row.section,
						value: sanitizeMatrixValue(row),
						source: row.source,
					}))
				: undefined,
		layerCounts: matrixLayerCounts(domain.matrix ?? []),
	};
}

export function doctorSnapshotPaths(root: string, domains: readonly string[]): string[] {
	return domains.map(domain => domainSnapshotPath(root, domain));
}

export async function writeDoctorSnapshots(
	root: string,
	document: DoctorSnapshotDocument,
): Promise<string[]> {
	const written: string[] = [];
	const snapshotRoot = path.join(root, DEFAULT_DOCTOR_SNAPSHOT_DIR);
	await mkdir(snapshotRoot, {recursive: true});

	for (const domain of document.domains) {
		const outPath = domainSnapshotPath(root, domain.id);
		await Bun.write(outPath, stableStringify({...document, domains: [domain]}));
		written.push(outPath);
	}

	const indexPath = path.join(snapshotRoot, 'index.json');
	await Bun.write(indexPath, stableStringify(document));
	written.push(indexPath);
	return written;
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
	root: string,
): Promise<DoctorSnapshotDocument | null> {
	return readDoctorSnapshotFile(path.join(root, DEFAULT_DOCTOR_SNAPSHOT_DIR, 'index.json'));
}
