import path from 'path';
import type {DomainConfig} from '../config/types.ts';
import {detectConfigDrift, type ConfigDrift} from '../config/drift.ts';
import {loadTemplate} from '../config/loader.ts';
import {applyDefaults} from '../config/defaults.ts';
import {privateInventoryPath} from '../config/vault-paths.ts';
import {resolveDomainAudit} from './audit-paths.ts';
import {severityPolicyFromDocument, type PolicyDocument} from '../policy/index.ts';
import {expectedDomainConfigBasename, validateDomainConfigPath} from './naming.ts';
import type {BundleSnapshot} from './doctor-snapshot-bundles.ts';
import {fingerprintFromSections} from './doctor-snapshot-canonical.ts';
import type {DoctorSnapshotDomain, DoctorSnapshotIssue} from './doctor-snapshot.ts';

export type {BundleSnapshot} from './doctor-snapshot-bundles.ts';

export interface DoctorSnapshotFilenameMeta {
	expected: string;
	actual: string;
	ok: boolean;
}

export interface DoctorSnapshotVaultMeta {
	path?: string;
	present: boolean;
	format: 'json5' | 'missing';
	inventoryCount: number;
	encryptedStore?: string;
	masterKeyName?: string;
	version?: number;
}

export interface DoctorSnapshotPolicyMeta {
	enabled: boolean;
	fatal: string[];
	warn: string[];
	feedSource: 'local' | 'remote' | 'none';
	feedUrl?: string;
	tomlAligned: boolean;
}

export interface DoctorSnapshotConcernsMeta {
	csrfEnabled: boolean;
	tlsUseSystemCA?: boolean;
	auditKind: 'jsonl' | 'sqlite' | 'none';
	auditPath?: string;
}

export interface DoctorSnapshotTemplateDrift {
	field: string;
	message: string;
}

export interface DoctorSnapshotEnrichment {
	filename: DoctorSnapshotFilenameMeta;
	vault: DoctorSnapshotVaultMeta;
	policy: DoctorSnapshotPolicyMeta;
	concerns: DoctorSnapshotConcernsMeta;
	templateDrift: DoctorSnapshotTemplateDrift[];
}

export interface DoctorSnapshotIssueDelta {
	added: number;
	removed: number;
	codes: string[];
}

export interface DoctorSnapshotDomainDiff {
	ok: boolean;
	missing: boolean;
	changed: boolean;
	sections: string[];
	fingerprint: string;
	previousFingerprint?: string;
	issueDelta?: DoctorSnapshotIssueDelta;
}

const DIFF_SECTIONS = [
	'ok',
	'issues',
	'branding',
	'policy',
	'vault',
	'concerns',
	'bundles',
	'secretInventoryNames',
	'templateDrift',
	'matrix',
	'filename',
	'fingerprint',
	'layerCounts',
] as const;

function sortedCopy(values: string[]): string[] {
	return [...values].sort();
}

function issueKey(issue: DoctorSnapshotIssue): string {
	return `${issue.field}|${issue.severity}|${issue.code ?? ''}`;
}

function stableSection(value: unknown): string {
	return JSON.stringify(value, (_key, item) => {
		if (item && typeof item === 'object' && !Array.isArray(item)) {
			return Object.fromEntries(
				Object.keys(item as Record<string, unknown>)
					.sort()
					.map(key => [key, (item as Record<string, unknown>)[key]]),
			);
		}
		return item;
	});
}

function arraysEqual(a: string[], b: string[]): boolean {
	const left = sortedCopy(a);
	const right = sortedCopy(b);
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Vault payload for fingerprinting — excludes machine-dependent `path`. */
function vaultFingerprintSection(
	vault: DoctorSnapshotVaultMeta,
): Omit<DoctorSnapshotVaultMeta, 'path'> {
	const {path: _path, ...rest} = vault;
	return rest;
}

/**
 * SHA-256 fingerprint of critical sections (v2 spec §3, §12, §16).
 * Order: vault (no path) | policy | concerns | templateDrift | bundles.
 */
export function computeDomainFingerprint(
	domain: Pick<
		DoctorSnapshotDomain,
		'policy' | 'vault' | 'concerns' | 'templateDrift' | 'bundles'
	>,
): string {
	return fingerprintFromSections([
		vaultFingerprintSection(domain.vault),
		domain.policy,
		domain.concerns,
		domain.templateDrift.length > 0 ? domain.templateDrift : '',
		domain.bundles ?? null,
	]);
}

/** Sections required by policy but absent from a domain snapshot (spec §17). */
export function missingRequiredSnapshotSections(
	domain: Pick<DoctorSnapshotDomain, 'vault' | 'policy' | 'bundles'>,
	required: readonly string[],
): string[] {
	const missing: string[] = [];
	for (const section of required) {
		switch (section) {
			case 'vault':
				if (!domain.vault.present) missing.push('vault');
				break;
			case 'policy':
				if (!domain.policy.enabled) missing.push('policy');
				break;
			case 'bundles':
				if (!domain.bundles) missing.push('bundles');
				break;
			case 'concerns':
				break;
			default:
				break;
		}
	}
	return missing;
}

export function diffDoctorSnapshotIssues(
	current: DoctorSnapshotIssue[],
	previous: DoctorSnapshotIssue[],
): DoctorSnapshotIssueDelta {
	const previousKeys = new Set(previous.map(issueKey));
	const currentKeys = new Set(current.map(issueKey));
	const addedIssues = current.filter(issue => !previousKeys.has(issueKey(issue)));
	const removedIssues = previous.filter(issue => !currentKeys.has(issueKey(issue)));

	return {
		added: addedIssues.length,
		removed: removedIssues.length,
		codes: [
			...new Set(
				addedIssues.map(issue => issue.code).filter((code): code is string => Boolean(code)),
			),
		],
	};
}

export function diffDoctorSnapshotDomains(
	current: DoctorSnapshotDomain,
	previous: DoctorSnapshotDomain | null,
): DoctorSnapshotDomainDiff {
	const fingerprint = current.fingerprint ?? computeDomainFingerprint(current);

	if (!previous) {
		return {ok: false, missing: true, changed: false, sections: [], fingerprint};
	}

	const sections = DIFF_SECTIONS.filter(section => {
		const left = current[section as keyof DoctorSnapshotDomain];
		const right = previous[section as keyof DoctorSnapshotDomain];
		return stableSection(left) !== stableSection(right);
	});

	const issueDelta = sections.includes('issues')
		? diffDoctorSnapshotIssues(current.issues, previous.issues)
		: undefined;

	return {
		ok: sections.length === 0,
		missing: false,
		changed: sections.length > 0,
		sections,
		fingerprint,
		previousFingerprint: previous.fingerprint,
		issueDelta,
	};
}

export async function collectDoctorSnapshotEnrichment(
	root: string,
	domainName: string,
	filePath: string,
	config: DomainConfig | undefined,
	options: {
		privateExists: boolean;
		policyDocument: PolicyDocument | null;
	} = {privateExists: false, policyDocument: null},
): Promise<DoctorSnapshotEnrichment> {
	const filenameCheck = validateDomainConfigPath(domainName, filePath);
	const privatePath = privateInventoryPath(filePath, domainName);

	let privateMeta: Record<string, unknown> | undefined;
	if (options.privateExists) {
		try {
			privateMeta = Bun.JSON5.parse(await Bun.file(privatePath).text()) as Record<string, unknown>;
		} catch {
			privateMeta = undefined;
		}
	}

	const inventoryCount = config?.secrets.inventory.length ?? 0;
	const audit = config ? resolveDomainAudit(config) : null;

	let templateDrift: ConfigDrift[] = [];
	if (config) {
		try {
			const template = await loadTemplate();
			const baseline = applyDefaults({...template, domain: config.domain});
			templateDrift = detectConfigDrift(config, baseline);
		} catch {
			templateDrift = [];
		}
	}

	const fatal = config?.supplyChain.policy.fatal ?? [];
	const warn = config?.supplyChain.policy.warn ?? [];
	let tomlAligned = true;
	if (options.policyDocument?.default && config) {
		const toml = severityPolicyFromDocument(options.policyDocument);
		tomlAligned = arraysEqual(fatal, toml.fatal) && arraysEqual(warn, toml.warn);
	}

	const remote = config?.supplyChain.feed?.remote;
	const local = config?.supplyChain.feed?.local;
	const feedSource: DoctorSnapshotPolicyMeta['feedSource'] = remote
		? 'remote'
		: local
			? 'local'
			: 'none';

	return {
		filename: {
			expected: expectedDomainConfigBasename(domainName),
			actual: path.basename(filePath),
			ok: filenameCheck.ok,
		},
		vault: {
			path: options.privateExists ? privatePath : undefined,
			present: options.privateExists,
			format: options.privateExists ? 'json5' : 'missing',
			inventoryCount,
			encryptedStore:
				typeof privateMeta?.encryptedStore === 'string' ? privateMeta.encryptedStore : undefined,
			masterKeyName:
				typeof privateMeta?.masterKeyName === 'string' ? privateMeta.masterKeyName : undefined,
			version: typeof privateMeta?.version === 'number' ? privateMeta.version : undefined,
		},
		policy: {
			enabled: config?.supplyChain.enabled ?? false,
			fatal: [...fatal],
			warn: [...warn],
			feedSource,
			feedUrl: remote ?? local,
			tomlAligned,
		},
		concerns: {
			csrfEnabled: config?.csrf?.enabled ?? false,
			tlsUseSystemCA: config?.tls?.useSystemCA,
			auditKind: audit?.kind ?? 'none',
			auditPath: audit?.path,
		},
		templateDrift: templateDrift.map(drift => ({field: drift.field, message: drift.message})),
	};
}
