import path from 'path';
import {isValidConfigColor} from '../color/index.ts';
import {validateBunRuntime, type BunRuntimeInfo} from '../utils/runtime.ts';
import {validateCrossRefApis, type CrossRefValidation} from '../xref/index.ts';
import {applyDefaults} from './defaults.ts';
import {detectConfigDrift} from './drift.ts';
import {loadTemplate, TEMPLATE_PATH, type LoadedDomain} from './loader.ts';
import {resolveEncryptedStorePath} from './vault-paths.ts';
import {getErrorCode} from '../color/codes.ts';
import {emitDoctorResultIssues} from '../logging/operator-log.ts';
import {enrichDoctorIssue} from '../logging/issue-catalog.ts';
import {hasMasterKey} from './master-key.ts';
import {hasEncryptedStore} from './encrypted-store.ts';
import {createVaultDomain} from '../domains/vault.ts';
import {isOsCredentialStoreAvailable} from '../secrets-backend.ts';
import {
	getSystemCARuntimeInfo,
	isMacosSystemCAEnumerationSlow,
	isSystemCAAvailable,
	MIN_BUN_SYSTEM_CA_FIX,
	type SystemCARuntimeInfo,
} from '../intel/tls/system-ca.ts';
import {
	getPlatformRuntimeInfo,
	MIN_BUN_WINDOWS_RUNTIME_FIX,
	MIN_BUN_TYPES_FFI_TSGo_FIX,
	type PlatformRuntimeInfo,
} from '../utils/platform-runtime.ts';
import {collectDoctorDiagnostics, type DoctorDiagnostics} from '../utils/doctor-diagnostics.ts';
import {
	auditConfigFormats,
	getConfigFormatRuntimeInfo,
	type ConfigFormatRuntimeInfo,
} from '../utils/config-format-runtime.ts';
import {
	auditInstallState,
	getInstallRuntimeInfo,
	validateInstallTarget,
	type InstallRuntimeInfo,
} from '../utils/install-runtime.ts';
import {isInteractiveForced, isInteractiveSession} from '../utils/process.ts';
import {
	getTerminalIORuntimeInfo,
	MIN_BUN_PIPELINE_PAGER_FIX,
	type TerminalIORuntimeInfo,
} from '../utils/terminal-io.ts';
import type {DomainConfig, SecretEntry} from './types.ts';
import {
	detectPublicSecretsServiceMismatch,
	resolveSecretsService,
	secretsServiceForDomain,
} from '../domain/secrets-service.ts';
import {
	resolveDomainAudit,
	resolveDomainAuditMasterKey,
	resolveDomainAuditPath,
} from '../domain/audit-paths.ts';
import {isReverseDnsDomain, isValidSecretName, validateDomainConfigPath} from '../domain/naming.ts';
import {detectPublicTokenIssuerMismatch, resolveTokenIssuer} from '../domain/token-issuer.ts';
import {domainBrandingProfile, type DomainBrandingProfile} from '../domain/branding.ts';
import {
	DOMAIN_FIELD_MATRIX,
	domainFieldValueRows,
	matrixLayerCounts,
	validateTemplateFieldCoverage,
	type DomainFieldSection,
	type DomainFieldValueRow,
} from '../domain/field-matrix.ts';
import {extractPackageMetadata, type PackageMetadata} from './package-metadata.ts';
import {
	buildDoctorSnapshotDocument,
	compareDoctorSnapshots,
	compareDoctorSnapshotsPerDomain,
	domainSnapshotPath,
	loadPreviousDoctorSnapshotIndex,
	resolveSnapshotRoot,
	writeDoctorSnapshots,
	type DoctorSnapshotDocument,
	type DoctorSnapshotPerDomainResult,
} from '../domain/doctor-snapshot.ts';
import {
	evaluateSnapshotCompatibilityGate,
	evaluateSnapshotDriftGate,
	parseSnapshotDriftSections,
	type SnapshotCompatibilityGateResult,
	type SnapshotDriftGateResult,
} from '../domain/doctor-snapshot-gate.ts';
import {collectDoctorSnapshotEnrichment} from '../domain/doctor-snapshot-deep.ts';
import {loadRootProjectPolicy} from '../domain/policy-bridge.ts';
import {computeBundleSnapshotsParallel} from '../domain/doctor-snapshot-parallel.ts';
import type {DoctorSnapshotEnrichment} from '../domain/doctor-snapshot-deep.ts';
import {newSnapshotHistoryId, SnapshotHistoryStore} from '../domain/snapshot-history.ts';
import {snapshotPolicyFromDocument} from '../policy/engine.ts';
import {collectSemverDoctorIssues} from '../intel/semver-checks.ts';
import {resolveScannerVersion} from '../intel/scanner-version.ts';
import {getBunSnapshotRuntimeInfo, type BunSnapshotRuntimeInfo} from '../utils/snapshot-runtime.ts';

export interface DoctorIssue {
	domain: string;
	path: string;
	field: string;
	message: string;
	severity: 'error' | 'warning';
	/** Machine-readable issue code (e.g. IMPLICIT_OPTIONAL_PEER). */
	code?: string;
	/** `domain` = reverse-DNS scoped; `core` = lib/install/runtime (set by catalog or emit). */
	scope?: 'domain' | 'core';
	/** Config field, glob, or module anchor — for pane filters. */
	location?: string;
	/** Concern channel (vault, ops, supplyChain, …). */
	channel?: string;
	/** Core log subdirectory when scope is `core`. */
	coreSegment?: string;
	/** Resolved `.security/<segment>/` path key. */
	logSegment?: string;
}

export interface DoctorRuntimeReport extends BunRuntimeInfo {
	apisOk: boolean;
	missingApis: string[];
	crossRef: CrossRefValidation;
	systemCA: SystemCARuntimeInfo;
	terminalIO: TerminalIORuntimeInfo;
	platform: PlatformRuntimeInfo;
	/** Process spawn, OS signals, Bun.nanoseconds / stringWidth / inspect.custom. */
	diagnostics: DoctorDiagnostics;
	/** Bun install target, lockfile, backend, and peer policy. */
	install: InstallRuntimeInfo;
	/** JSON5 domain/vault vs TOML policy format separation. */
	configFormat: ConfigFormatRuntimeInfo;
}

export interface DoctorTemplateCoverage {
	ok: boolean;
	missing: string[];
	catalogFields: number;
	path: string;
	layerCounts: ReturnType<typeof matrixLayerCounts>;
}

export interface DoctorDomainReport {
	domain: string;
	path: string;
	ok: boolean;
	issues: DoctorIssue[];
	/** Branding + service profile when the domain config loaded successfully. */
	branding?: DomainBrandingProfile;
	/** Resolved field values when matrix collection is enabled. */
	matrix?: DomainFieldValueRow[];
	/** Secret inventory names only (no values) for snapshot metadata. */
	secretInventoryNames?: string[];
	/** Vault / policy / concerns enrichment for v2 per-domain snapshots. */
	snapshotEnrichment?: DoctorSnapshotEnrichment;
	/** Layer 4.5 bundle aggregate snapshot (spec §16). */
	bundleSnapshot?: import('../domain/doctor-snapshot-bundles.ts').BundleSnapshot | null;
}

export interface DoctorMatrixReport {
	template: DomainFieldValueRow[];
	domains: Record<string, DomainFieldValueRow[]>;
	layerCounts: ReturnType<typeof matrixLayerCounts>;
}

export interface DoctorSnapshotReport {
	ok: boolean;
	updateRequested: boolean;
	matcherAvailable: boolean;
	written: string[];
	compared: boolean;
	missing: string[];
	changed: string[];
	extra: string[];
	/** Per-domain snapshot compare against baseline `<domain>.json`. */
	perDomain: DoctorSnapshotPerDomainResult[];
	/** Resolved baseline directory (default `.security/snapshots/doctor` or `--baseline-dir`). */
	snapshotRoot: string;
	/** CI gate result when `--fail-on-drift` is set. */
	driftGate?: SnapshotDriftGateResult;
	/** Scanner/schema compatibility gate when `--fail-on-drift` is set. */
	compatibilityGate?: SnapshotCompatibilityGateResult;
	document?: DoctorSnapshotDocument;
}

export interface DoctorCheckOptions {
	/** Scan node_modules for peerDependenciesMeta-only peers (default: true). */
	peerMeta?: boolean;
	/** Collect per-domain field matrix rows (for --matrix / JSON). */
	matrix?: boolean;
	/** Optional matrix section filter. */
	matrixSection?: DomainFieldSection;
	/** Build doctor snapshot metadata (always when true). */
	snapshot?: boolean;
	/** Write snapshot files (`bun test --update-snapshots` compatible flag). */
	updateSnapshots?: boolean;
	/** Override snapshot baseline directory (e.g. `.baseline`). */
	baselineDir?: string;
	/** Exit non-zero when critical sections drift (CI gate). */
	failOnDrift?: boolean;
	/** Comma-separated critical sections for drift gate (default: vault,policy,concerns,templateDrift). */
	driftSections?: string;
	argv?: readonly string[];
	/** Preview `bun install --cpu` target (doctor cross-build diagnostics). */
	installCpu?: string;
	/** Preview `bun install --os` target (doctor cross-build diagnostics). */
	installOs?: string;
	/** Worker count for parallel snapshot bundle hashing (default: 4 when >= 4 domains). */
	workers?: number;
}

export interface DoctorResult {
	ok: boolean;
	domains: DoctorDomainReport[];
	errors: number;
	warnings: number;
	crossDomainIssues: DoctorIssue[];
	peerMetaIssues: DoctorIssue[];
	runtime: DoctorRuntimeReport;
	templateCoverage: DoctorTemplateCoverage;
	matrix?: DoctorMatrixReport;
	packageMetadata?: PackageMetadata | null;
	snapshotRuntime?: BunSnapshotRuntimeInfo;
	snapshot?: DoctorSnapshotReport;
}

const SUPPORTED_PASSWORD_ALGORITHMS = new Set(['bcrypt', 'argon2id', 'argon2i', 'argon2d']);

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(v => typeof v === 'string');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function privateVaultPath(domainFilePath: string, domain: string): string {
	return path.resolve(path.dirname(domainFilePath), '..', '.vault', `${domain}.inventory.json5`);
}

interface PrivateVaultConfig {
	domain?: string;
	version?: number;
	createdAt?: string;
	masterKeyName?: string;
	encryptedStore?: string;
	secrets?: {
		inventory?: SecretEntry[];
	};
}

function validatePublicFile(
	domain: string,
	path: string,
	publicRaw: Record<string, unknown>,
	privateExists: boolean,
): DoctorIssue[] {
	const issues: DoctorIssue[] = [];
	const report = (field: string, message: string, severity: 'error' | 'warning' = 'error') => {
		issues.push({domain, path, field, message, severity});
	};

	const secrets = isPlainObject(publicRaw.secrets) ? publicRaw.secrets : undefined;

	const serviceMismatch = detectPublicSecretsServiceMismatch(domain, publicRaw);
	if (serviceMismatch) {
		report(
			'secrets.service',
			`secrets.service "${serviceMismatch}" does not match domain "${domain}"; Bun.secrets lookups always use the domain id`,
			'error',
		);
	}

	const issuerMismatch = detectPublicTokenIssuerMismatch(domain, publicRaw);
	if (issuerMismatch) {
		report(
			'token.issuer',
			`token.issuer "${issuerMismatch}" does not match domain "${domain}"; issuer is synced to the domain id on load`,
			'warning',
		);
	}

	if (Array.isArray(secrets?.inventory)) {
		report(
			'secrets.inventory',
			'Inline inventory should be migrated to a private vault file',
			'warning',
		);
	}

	if (secrets?.inventory && !privateExists && !secrets?.inventoryFile) {
		report(
			'secrets.inventory',
			'Inline inventory present but no private vault file found',
			'error',
		);
	}

	return issues;
}

async function validatePrivateFile(
	domain: string,
	privatePath: string,
	publicPath: string,
	privateRaw: PrivateVaultConfig,
): Promise<DoctorIssue[]> {
	const issues: DoctorIssue[] = [];
	const report = (field: string, message: string, severity: 'error' | 'warning' = 'error') => {
		issues.push({domain, path: privatePath, field, message, severity});
	};

	if (typeof privateRaw.domain !== 'string' || privateRaw.domain !== domain) {
		report('domain', `Private vault domain must match public domain "${domain}"`, 'error');
	}

	const hasPhaseB =
		typeof privateRaw.masterKeyName === 'string' && typeof privateRaw.encryptedStore === 'string';
	const hasPhaseA = Array.isArray(privateRaw.secrets?.inventory);

	if (hasPhaseB) {
		const storePath = resolveEncryptedStorePath(privatePath, privateRaw.encryptedStore as string);
		if (!(await hasEncryptedStore(storePath))) {
			report('encryptedStore', `Encrypted store not found at ${storePath}`, 'error');
		}

		const masterKeyPresent = await hasMasterKey({
			service: secretsServiceForDomain(domain),
			name: privateRaw.masterKeyName as string,
		});
		if (!masterKeyPresent) {
			report(
				'masterKeyName',
				`Master key "${privateRaw.masterKeyName}" not found in Bun.secrets for ${domain}`,
				'warning',
			);
		}
	}

	if (hasPhaseA) {
		const inventory = privateRaw.secrets?.inventory ?? [];
		if (inventory.length === 0) {
			report('secrets.inventory', 'Private vault inventory is empty', 'warning');
		}

		const names = new Set<string>();
		for (const entry of inventory) {
			if (!isPlainObject(entry)) {
				report('secrets.inventory', 'Every inventory entry must be an object', 'error');
				continue;
			}

			const name = entry.name;
			if (typeof name !== 'string' || name.length === 0) {
				report('secrets.inventory.name', 'Every secret entry must have a name', 'error');
				continue;
			}

			if (names.has(name)) {
				report(`secrets.inventory.${name}`, `Duplicate secret name "${name}"`, 'error');
			} else {
				names.add(name);
			}

			if (entry.required === true && !entry.description) {
				report(
					`secrets.inventory.${name}.description`,
					`Required secret "${name}" should have a description`,
					'warning',
				);
			}

			if (entry.allowUnrestrictedAccess === true) {
				report(
					`secrets.inventory.${name}.allowUnrestrictedAccess`,
					`Secret "${name}" allows unrestricted access`,
					'warning',
				);
			}
		}
	}

	if (!hasPhaseB && !hasPhaseA) {
		report('private', 'Private vault has neither encryptedStore nor inline inventory', 'warning');
	}

	return issues;
}

function validateDomain(loaded: LoadedDomain): DoctorIssue[] {
	const issues: DoctorIssue[] = [];
	const config = loaded.config;
	const report = (
		field: string,
		message: string,
		severity: 'error' | 'warning' = 'error',
		code?: string,
	) => {
		const issue = enrichDoctorIssue({
			domain: config.domain,
			path: loaded.path,
			field,
			message,
			severity,
			code,
		});
		issues.push(issue);
	};

	if (!config.domain || config.domain.length === 0) {
		report('domain', 'Domain identifier is required', 'error');
	} else if (!isReverseDnsDomain(config.domain)) {
		report('domain', 'Domain must be a valid reverse-DNS string', 'error');
	}

	const filenameCheck = validateDomainConfigPath(config.domain, loaded.path);
	if (!filenameCheck.ok && filenameCheck.message) {
		report('_filename', filenameCheck.message, 'error', 'DOMAIN_FILENAME_MISMATCH');
	}

	for (const [key, value] of Object.entries(config.colors)) {
		if (!isValidConfigColor(value)) {
			report(`colors.${key}`, `Color must be a valid CSS color, got ${value}`, 'error');
		}
	}

	for (const [key, value] of Object.entries(config.channels)) {
		if (!isValidConfigColor(value)) {
			report(`channels.${key}`, `Channel color must be a valid CSS color, got ${value}`, 'error');
		}
	}

	if (config.secrets.inventory.some((s: {name?: string}) => !s.name || s.name.length === 0)) {
		report('secrets.inventory', 'Every secret entry must have a name', 'error');
	}

	const expectedService = resolveSecretsService(config);
	if (config.secrets.service !== expectedService) {
		report(
			'secrets.service',
			`secrets.service "${config.secrets.service}" must match domain "${expectedService}"`,
			'error',
			'SECRETS_SERVICE_MISMATCH',
		);
	}

	const expectedIssuer = resolveTokenIssuer(config);
	if (config.token.issuer !== expectedIssuer) {
		report(
			'token.issuer',
			`token.issuer "${config.token.issuer}" should match domain "${expectedIssuer}"`,
			'warning',
			'TOKEN_ISSUER_MISMATCH',
		);
	}

	const inventoryNames = new Set<string>();
	for (const entry of config.secrets.inventory) {
		if (!entry.name) continue;
		if (!isValidSecretName(entry.name)) {
			report(
				`secrets.inventory.${entry.name}`,
				`Secret name "${entry.name}" must be kebab-case (lowercase, digits, hyphens)`,
				'error',
				'SECRET_NAME_INVALID',
			);
		}
		if (inventoryNames.has(entry.name)) {
			report(
				`secrets.inventory.${entry.name}`,
				`Duplicate secret name "${entry.name}" in domain inventory`,
				'error',
			);
		} else {
			inventoryNames.add(entry.name);
		}
	}

	if (config.identity.minLength < 1) {
		report('identity.minLength', 'Minimum password length must be at least 1', 'error');
	}

	if (!SUPPORTED_PASSWORD_ALGORITHMS.has(config.identity.algorithm)) {
		report(
			'identity.algorithm',
			`Unsupported password algorithm "${config.identity.algorithm}"; expected one of: ${[...SUPPORTED_PASSWORD_ALGORITHMS].join(', ')}`,
			'error',
		);
	}

	if (config.identity.algorithm === 'bcrypt' && config.identity.cost !== undefined) {
		if (config.identity.cost < 4 || config.identity.cost > 31) {
			report('identity.cost', 'Bcrypt cost must be between 4 and 31', 'error');
		}
	}

	if (config.token.ttlSeconds < 1) {
		report('token.ttlSeconds', 'Token TTL must be positive', 'error');
	}

	const auditPath = resolveDomainAuditPath(config);
	if (auditPath && !resolveDomainAuditMasterKey(config)) {
		const field =
			resolveDomainAudit(config)?.kind === 'sqlite'
				? 'audit.sqlite.masterKey'
				: 'audit.jsonl.masterKey';
		report(
			field,
			`Audit path "${auditPath}" is configured but no master key is set (inline key or AUDIT_MASTER_KEY)`,
			'warning',
			'AUDIT_MASTER_KEY_MISSING',
		);
	}

	if (config.csrf.tokenLength < 1) {
		report('csrf.tokenLength', 'CSRF token length must be positive', 'error');
	}

	if (!isStringArray(config.supplyChain.policy.fatal)) {
		report('supplyChain.policy.fatal', 'Fatal categories must be an array of strings', 'error');
	}
	if (!isStringArray(config.supplyChain.policy.warn)) {
		report('supplyChain.policy.warn', 'Warn categories must be an array of strings', 'error');
	}

	if (config.ops.watch.debounceMs < 0) {
		report('ops.watch.debounceMs', 'Debounce must be non-negative', 'error');
	}

	if (config.supplyChain.feed.apiKeyVault) {
		const feedService = config.supplyChain.feed.apiKeyService ?? resolveSecretsService(config);
		if (feedService !== resolveSecretsService(config)) {
			report(
				'supplyChain.feed.apiKeyService',
				`Feed API key service "${feedService}" must match domain secrets service "${resolveSecretsService(config)}"`,
				'error',
				'SECRETS_SERVICE_MISMATCH',
			);
		}
	}

	for (const code of Object.keys(config.errorOverrides)) {
		if (!getErrorCode(code)) {
			report(
				`errorOverrides.${code}`,
				`Unknown error code "${code}"`,
				'warning',
				'UNKNOWN_ERROR_OVERRIDE',
			);
		}
	}

	if (config.service?.interactive && !isInteractiveSession() && !isInteractiveForced()) {
		report(
			'service.interactive',
			'Interactive external scanners (Bun.Terminal PTY) require stdin and stdout TTYs. Run from a terminal (`bun sp shell`, `bun run scan interactive`) or use JSON-only commands when piping.',
			'warning',
			'INTERACTIVE_NON_TTY',
		);
	}

	if (isSystemCAAvailable() && config.tls?.useSystemCA === false) {
		report(
			'tls.useSystemCA',
			'System CA certificates are available (tls.getCACertificates("system")), but tls.useSystemCA is false. Remove the override to validate automatically, or keep false to skip OS trust validation.',
			'warning',
			'SYSTEM_CA_AVAILABLE',
		);
	}

	return issues;
}

async function validateDomainSecurity(loaded: LoadedDomain): Promise<DoctorIssue[]> {
	const issues: DoctorIssue[] = [];
	const config = loaded.config;
	const report = (field: string, message: string, severity: 'error' | 'warning' = 'error') => {
		issues.push({domain: config.domain, path: loaded.path, field, message, severity});
	};

	if (config.csrf.enabled) {
		const available = await isOsCredentialStoreAvailable();
		if (!available) {
			report('csrf', 'CSRF is enabled but the OS credential store is unavailable', 'warning');
		} else {
			try {
				const secret = await createVaultDomain(config.domain).get('csrf-secret');
				if (secret.length === 0) {
					report(
						'csrf',
						'CSRF is enabled but no csrf-secret is stored in the domain vault',
						'warning',
					);
				}
			} catch {
				report('csrf', 'Could not read csrf-secret from the OS credential store', 'warning');
			}
		}
	}

	return issues;
}

/** True when a domain report has no error-severity issues (warnings are allowed). */
export function domainReportOk(issues: DoctorIssue[]): boolean {
	return !issues.some(issue => issue.severity === 'error');
}

/**
 * Validate a single loaded domain (structural checks on merged config only).
 */
export function checkDomain(loaded: LoadedDomain): {ok: boolean; issues: DoctorIssue[]} {
	const issues = validateDomain(loaded);
	return {ok: domainReportOk(issues), issues};
}

/**
 * Full async validation for a loaded domain — public/private vault, CSRF, drift.
 * Matches the per-domain pipeline used by `checkAllDomains` / `bun sp doctor`.
 */
export async function checkLoadedDomain(
	loaded: LoadedDomain,
): Promise<{ok: boolean; issues: DoctorIssue[]}> {
	const {domain, path: filePath} = loaded;
	const issues: DoctorIssue[] = [];

	if (!(await Bun.file(filePath).exists())) {
		issues.push(...validateDomain(loaded));
		issues.push(...(await validateDomainSecurity(loaded)));
		return {ok: domainReportOk(issues), issues};
	}

	let publicRaw: Record<string, unknown>;
	try {
		publicRaw = Bun.JSON5.parse(await Bun.file(filePath).text()) as Record<string, unknown>;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		issues.push({
			domain,
			path: filePath,
			field: 'file',
			message: `Could not parse domain config: ${message}`,
			severity: 'error',
		});
		return {ok: domainReportOk(issues), issues};
	}

	const privatePath = privateVaultPath(filePath, domain);
	const privateExists = await Bun.file(privatePath).exists();
	issues.push(...validatePublicFile(domain, filePath, publicRaw, privateExists));

	if (privateExists) {
		try {
			const privateRaw = Bun.JSON5.parse(await Bun.file(privatePath).text()) as PrivateVaultConfig;
			issues.push(...(await validatePrivateFile(domain, privatePath, filePath, privateRaw)));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			issues.push({
				domain,
				path: privatePath,
				field: 'file',
				message: `Could not parse private vault: ${message}`,
				severity: 'error',
			});
		}
	}

	issues.push(...validateDomain(loaded));
	issues.push(...(await validateDomainSecurity(loaded)));

	try {
		const template = await loadTemplate();
		const baseline = applyDefaults({...template, domain: loaded.config.domain});
		for (const drift of detectConfigDrift(loaded.config, baseline)) {
			issues.push({
				domain,
				path: filePath,
				field: drift.field,
				message: drift.message,
				severity: 'warning',
			});
		}
	} catch {
		// Template drift checks are best-effort.
	}

	return {ok: domainReportOk(issues), issues};
}

/**
 * Validate all domain configs in the project.
 */
export async function checkAllDomains(
	root: string,
	options: DoctorCheckOptions = {},
): Promise<DoctorResult> {
	const includePeerMeta = options.peerMeta !== false;
	const {discoverDomainFiles, loadDomainFile} = await import('./loader.ts');
	const {applyDefaults} = await import('./defaults.ts');
	const files = discoverDomainFiles(root);

	const collectMatrix =
		options.matrix === true || options.snapshot === true || options.failOnDrift === true;
	const collectSnapshot = options.snapshot === true || options.failOnDrift === true;
	const snapshotRuntime = getBunSnapshotRuntimeInfo(options.argv);
	const updateSnapshots = options.updateSnapshots === true || snapshotRuntime.updateRequested;
	const matrixSection = options.matrixSection;
	const packageMetadata = await extractPackageMetadata(`${root}/package.json`);
	const rootPolicyDocument = collectSnapshot ? await loadRootProjectPolicy(root) : null;
	const domains: DoctorDomainReport[] = [];
	let errors = 0;
	let warnings = 0;
	const secretNamesByDomain = new Map<string, Set<string>>();
	const matrixDomains: Record<string, DomainFieldValueRow[]> = {};
	const bundleSnapshotJobs: Array<{domain: string; config: import('./types.ts').DomainConfig}> = [];

	const templateCoverageRaw = await validateTemplateFieldCoverage();
	const templateCoverage: DoctorTemplateCoverage = {
		ok: templateCoverageRaw.ok,
		missing: templateCoverageRaw.missing,
		catalogFields: DOMAIN_FIELD_MATRIX.length,
		path: TEMPLATE_PATH,
		layerCounts: matrixLayerCounts(),
	};

	for (const filePath of files) {
		let publicRaw: Record<string, unknown>;
		try {
			publicRaw = Bun.JSON5.parse(await Bun.file(filePath).text()) as Record<string, unknown>;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const issue: DoctorIssue = {
				domain: '<unknown>',
				path: filePath,
				field: 'file',
				message: `Could not parse domain config: ${message}`,
				severity: 'error',
			};
			domains.push({domain: '<unknown>', path: filePath, ok: false, issues: [issue]});
			errors += 1;
			continue;
		}

		const domainName = typeof publicRaw.domain === 'string' ? publicRaw.domain : '<unknown>';
		const privatePath = privateVaultPath(filePath, domainName);
		const privateExists = await Bun.file(privatePath).exists();

		const issues: DoctorIssue[] = [];
		issues.push(...validatePublicFile(domainName, filePath, publicRaw, privateExists));

		let loaded: LoadedDomain | undefined;
		try {
			loaded = await loadDomainFile(filePath);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			// Encrypted inventories without VAULT_MASTER_KEY are still valid from a
			// config standpoint; report a warning instead of failing the whole doctor.
			if (message.includes('VAULT_MASTER_KEY')) {
				issues.push({
					domain: domainName,
					path: filePath,
					field: 'secrets.inventoryFile',
					message: `${message} — set the key to validate secret contents`,
					severity: 'warning',
				});
			} else {
				issues.push({
					domain: domainName,
					path: filePath,
					field: 'config',
					message: `Could not load domain config: ${message}`,
					severity: 'error',
				});
			}
		}

		if (privateExists) {
			try {
				const privateRaw = Bun.JSON5.parse(
					await Bun.file(privatePath).text(),
				) as PrivateVaultConfig;
				const privateIssues = await validatePrivateFile(
					domainName,
					privatePath,
					filePath,
					privateRaw,
				);
				issues.push(...privateIssues);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				issues.push({
					domain: domainName,
					path: privatePath,
					field: 'file',
					message: `Could not parse private vault: ${message}`,
					severity: 'error',
				});
			}
		}

		if (loaded) {
			const mergedResult = checkDomain(loaded);
			issues.push(...mergedResult.issues);
			issues.push(...(await validateDomainSecurity(loaded)));

			try {
				const template = await loadTemplate();
				const baseline = applyDefaults({...template, domain: loaded.config.domain});
				for (const drift of detectConfigDrift(loaded.config, baseline)) {
					issues.push({
						domain: domainName,
						path: filePath,
						field: drift.field,
						message: drift.message,
						severity: 'warning',
					});
				}
			} catch {
				// Template drift checks are best-effort.
			}

			const names = new Set<string>();
			for (const entry of loaded.config.secrets.inventory) {
				if (entry.name) names.add(entry.name);
			}
			secretNamesByDomain.set(domainName, names);
		} else {
			// If we couldn't load the full config, run the structural checks on the
			// public defaults so we still report color/domain errors.
			try {
				const config = applyDefaults(publicRaw);
				const mergedResult = checkDomain({domain: domainName, path: filePath, config});
				issues.push(...mergedResult.issues);
			} catch {
				// applyDefaults will fail when the public file is structurally broken,
				// but we already reported the parse/config error above.
			}
		}

		let branding: DomainBrandingProfile | undefined;
		let matrix: DomainFieldValueRow[] | undefined;
		let secretInventoryNames: string[] | undefined;
		let snapshotEnrichment: DoctorSnapshotEnrichment | undefined;
		let bundleSnapshot: DoctorDomainReport['bundleSnapshot'];
		if (loaded) {
			branding = domainBrandingProfile(loaded.config);
			secretInventoryNames = loaded.config.secrets.inventory
				.map(entry => entry.name)
				.filter(name => name.length > 0);
			if (collectMatrix) {
				matrix = domainFieldValueRows(loaded.config, {section: matrixSection});
				matrixDomains[domainName] = matrix;
			}
			if (collectSnapshot) {
				snapshotEnrichment = await collectDoctorSnapshotEnrichment(
					root,
					domainName,
					filePath,
					loaded.config,
					{privateExists, policyDocument: rootPolicyDocument},
				);
				bundleSnapshotJobs.push({domain: domainName, config: loaded.config});
			}
			for (const semverIssue of await collectSemverDoctorIssues(
				root,
				domainName,
				filePath,
				loaded.config,
				rootPolicyDocument,
			)) {
				issues.push(enrichDoctorIssue(semverIssue));
			}
		}

		errors += issues.filter(i => i.severity === 'error').length;
		warnings += issues.filter(i => i.severity === 'warning').length;
		domains.push({
			domain: domainName,
			path: filePath,
			ok: domainReportOk(issues),
			issues,
			branding,
			matrix,
			secretInventoryNames,
			snapshotEnrichment,
			bundleSnapshot,
		});
	}

	if (collectSnapshot && bundleSnapshotJobs.length > 0) {
		const bundleSnapshots = await computeBundleSnapshotsParallel(root, bundleSnapshotJobs, {
			workerCount: options.workers,
		});
		for (const domainReport of domains) {
			if (bundleSnapshots.has(domainReport.domain)) {
				domainReport.bundleSnapshot = bundleSnapshots.get(domainReport.domain) ?? null;
			}
		}
	}

	if (files.length === 0) {
		const template = await loadTemplate();
		const result = checkDomain({domain: template.domain, path: TEMPLATE_PATH, config: template});
		// Only report template issues if no domain files exist.
		errors += result.issues.filter(i => i.severity === 'error').length;
		warnings += result.issues.filter(i => i.severity === 'warning').length;
	}

	let crossDomainIssues = runCrossDomainChecks(secretNamesByDomain);

	if (!templateCoverage.ok) {
		crossDomainIssues.push({
			domain: '*',
			path: templateCoverage.path,
			field: 'template.coverage',
			message: `Golden template missing ${templateCoverage.missing.length} catalog field(s): ${templateCoverage.missing.join(', ')}`,
			severity: 'error',
			code: 'TEMPLATE_FIELD_MISSING',
		});
		errors += 1;
	}

	warnings += crossDomainIssues.filter(i => i.severity === 'warning').length;
	errors += crossDomainIssues.filter(i => i.severity === 'error').length;

	let peerMetaIssues: DoctorIssue[] = [];
	if (includePeerMeta) {
		const {checkPeerDependenciesMeta} = await import('../supply-chain/peer-meta.ts');
		const peerMeta = await checkPeerDependenciesMeta(root);
		peerMetaIssues = peerMeta.issues;
		warnings += peerMeta.warnings;
	}

	const runtimeValidation = validateBunRuntime();
	const crossRef = validateCrossRefApis();
	const systemCA = getSystemCARuntimeInfo({
		measureEnumeration: process.platform === 'darwin',
	});
	const terminalIO = getTerminalIORuntimeInfo();
	const platform = await getPlatformRuntimeInfo(`${root}/package.json`);
	const installOverride = {cpu: options.installCpu, os: options.installOs};
	const [install, configFormat] = await Promise.all([
		getInstallRuntimeInfo(root, installOverride),
		getConfigFormatRuntimeInfo(root),
	]);
	const runtime: DoctorRuntimeReport = {
		...runtimeValidation.info,
		apisOk: runtimeValidation.ok,
		missingApis: runtimeValidation.missing,
		crossRef,
		systemCA,
		terminalIO,
		platform,
		diagnostics: collectDoctorDiagnostics(),
		install,
		configFormat,
	};

	const installFindings = auditInstallState(
		install.lockfile,
		validateInstallTarget(installOverride),
		root,
	);
	for (const finding of installFindings) {
		crossDomainIssues.push({
			domain: 'install',
			path: root,
			field: finding.field,
			message: finding.message,
			severity: finding.severity,
			code: finding.code,
		});
		if (finding.severity === 'error') {
			errors += 1;
		} else {
			warnings += 1;
		}
	}

	const configFormatFindings = auditConfigFormats(configFormat);
	for (const finding of configFormatFindings) {
		crossDomainIssues.push({
			domain: 'config',
			path: finding.path ?? root,
			field: finding.field,
			message: finding.message,
			severity: finding.severity,
			code: finding.code,
		});
		if (finding.severity === 'error') {
			errors += 1;
		} else {
			warnings += 1;
		}
	}

	if (platform.platform === 'win32' && !platform.windowsRuntimeSafe) {
		crossDomainIssues.push({
			domain: '*',
			path: runtimeValidation.info.main,
			field: 'runtime.platform',
			message: `Upgrade to Bun >= ${MIN_BUN_WINDOWS_RUNTIME_FIX} on Windows for path ENAMETOOLONG handling, spawn teardown, Bun.connect named pipes, and libuv errno mapping.`,
			severity: 'warning',
			code: 'WINDOWS_RUNTIME_UPGRADE',
		});
		warnings += 1;
	}

	if (!platform.bunTypesTsgoCompatible) {
		crossDomainIssues.push({
			domain: '*',
			path: `${root}/package.json`,
			field: 'devDependencies.bun-types',
			message: `Upgrade bun-types to >= ${MIN_BUN_TYPES_FFI_TSGo_FIX} for tsgo-compatible FFI declarations (current: ${platform.bunTypesVersion ?? 'unknown'}).`,
			severity: 'warning',
			code: 'BUN_TYPES_TSGo',
		});
		warnings += 1;
	}

	if (
		terminalIO.platform === 'win32' &&
		terminalIO.terminalApiAvailable &&
		terminalIO.interactiveSession
	) {
		crossDomainIssues.push({
			domain: '*',
			path: runtimeValidation.info.main,
			field: 'runtime.terminalIO',
			message: `${terminalIO.platformNote} Kill child processes before terminal.close(); prefer terminal.resize() over SIGWINCH.`,
			severity: 'warning',
			code: 'WINDOWS_CONPTY_INTERACTIVE',
		});
		warnings += 1;
	}

	if (terminalIO.pipelineProducer && !terminalIO.pipelinePagerSafe) {
		crossDomainIssues.push({
			domain: '*',
			path: runtimeValidation.info.main,
			field: 'runtime.terminalIO',
			message: `stdout is a pipe; upgrade to Bun >= ${MIN_BUN_PIPELINE_PAGER_FIX} so pagers (less, fzf, fx) keep raw mode after this process exits.`,
			severity: 'warning',
			code: 'PIPELINE_PAGER_TERMIOS',
		});
		warnings += 1;
	}

	if (
		systemCA.enumerationMs !== undefined &&
		isMacosSystemCAEnumerationSlow(systemCA.enumerationMs) &&
		!systemCA.macosEnumerationSafe
	) {
		crossDomainIssues.push({
			domain: '*',
			path: runtimeValidation.info.main,
			field: 'tls.systemCA',
			message: `macOS system CA enumeration took ${systemCA.enumerationMs}ms. Upgrade to Bun >= ${MIN_BUN_SYSTEM_CA_FIX} to avoid trustd network fetches on managed Macs with content filters.`,
			severity: 'warning',
			code: 'MACOS_SYSTEM_CA_SLOW',
		});
		warnings += 1;
	}

	if (!runtimeValidation.ok) {
		crossDomainIssues.push(
			enrichDoctorIssue({
				domain: '*',
				path: runtimeValidation.info.main,
				field: 'runtime',
				message: `Missing Bun APIs: ${runtimeValidation.missing.join(', ')}`,
				severity: 'error',
				code: 'RUNTIME_API_MISSING',
			}),
		);
		errors += 1;
	}

	let matrixReport: DoctorMatrixReport | undefined;
	if (collectMatrix) {
		const template = await loadTemplate();
		matrixReport = {
			template: domainFieldValueRows(template, {section: matrixSection}),
			domains: matrixDomains,
			layerCounts: matrixLayerCounts(
				matrixSection
					? DOMAIN_FIELD_MATRIX.filter(row => row.section === matrixSection)
					: DOMAIN_FIELD_MATRIX,
			),
		};
	}

	let snapshotReport: DoctorSnapshotReport | undefined;
	if (collectSnapshot) {
		const snapshotRoot = resolveSnapshotRoot(root, options.baselineDir);
		const document = buildDoctorSnapshotDocument(
			{
				ok: errors === 0 && files.length > 0,
				domains,
				errors,
				warnings,
				crossDomainIssues: [],
				peerMetaIssues: [],
				runtime: {} as DoctorRuntimeReport,
				templateCoverage,
				matrix: matrixReport,
				packageMetadata,
				snapshotRuntime,
			},
			{packageMetadata, snapshotRuntime, includeMatrix: collectMatrix},
		);

		const snapshotPolicy = snapshotPolicyFromDocument(rootPolicyDocument);
		const scannerVersion = await resolveScannerVersion(root);
		const previous = updateSnapshots ? null : await loadPreviousDoctorSnapshotIndex(snapshotRoot);
		const comparison = previous
			? compareDoctorSnapshots(document, previous)
			: {ok: true, missing: [], changed: [], extra: []};
		const perDomain: DoctorSnapshotPerDomainResult[] = updateSnapshots
			? document.domains.map(domain => ({
					domain: domain.id,
					path: domainSnapshotPath(snapshotRoot, domain.id),
					ok: true,
					missing: false,
					changed: false,
					fingerprint: domain.fingerprint,
					changedSections: [] as string[],
				}))
			: await compareDoctorSnapshotsPerDomain(document, snapshotRoot, {
					policy: snapshotPolicy,
					scannerVersion,
				});

		let written: string[] = [];
		if (updateSnapshots) {
			written = await writeDoctorSnapshots(snapshotRoot, document, {scannerVersion});
		} else if (!previous && perDomain.every(entry => entry.missing)) {
			crossDomainIssues.push({
				domain: '*',
				path: snapshotRoot,
				field: 'snapshot.index',
				message:
					'No doctor snapshot baseline found — run with --update-snapshots (or -u) to create per-domain baselines',
				severity: 'warning',
				code: 'DOCTOR_SNAPSHOT_MISSING',
			});
			warnings += 1;
		} else if (!comparison.ok) {
			const parts = [
				comparison.missing.length ? `missing: ${comparison.missing.join(', ')}` : '',
				comparison.changed.length ? `changed: ${comparison.changed.join(', ')}` : '',
				comparison.extra.length ? `extra: ${comparison.extra.join(', ')}` : '',
			].filter(Boolean);
			crossDomainIssues.push({
				domain: '*',
				path: path.join(snapshotRoot, 'index.json'),
				field: 'snapshot.drift',
				message: `Doctor snapshot index drift detected (${parts.join('; ')}) — run with --update-snapshots to refresh`,
				severity: 'warning',
				code: 'DOCTOR_SNAPSHOT_DRIFT',
			});
			warnings += 1;
		}

		const allPerDomainMissing = perDomain.every(entry => entry.missing);

		if (!updateSnapshots) {
			for (const entry of perDomain) {
				if (entry.missing) {
					if (!previous && allPerDomainMissing) {
						continue;
					}
					crossDomainIssues.push({
						domain: entry.domain,
						path: entry.path,
						field: 'snapshot.domain',
						message:
							'No per-domain doctor snapshot baseline — run with --update-snapshots (or -u) to create',
						severity: 'warning',
						code: 'DOCTOR_SNAPSHOT_DOMAIN_MISSING',
					});
					warnings += 1;
					continue;
				}
				if (entry.snapshotVersionWarning) {
					crossDomainIssues.push({
						domain: entry.domain,
						path: entry.path,
						field: 'snapshot.version',
						message: entry.snapshotVersionWarning,
						severity: 'warning',
						code: 'DOCTOR_SNAPSHOT_VERSION_INCOMPATIBLE',
					});
					warnings += 1;
				}
				if (entry.changed) {
					const sections =
						entry.changedSections.length > 0 ? ` (${entry.changedSections.join(', ')})` : '';
					const issueNote =
						entry.issueDelta && (entry.issueDelta.added > 0 || entry.issueDelta.removed > 0)
							? `; issues +${entry.issueDelta.added}/-${entry.issueDelta.removed}`
							: '';
					crossDomainIssues.push({
						domain: entry.domain,
						path: entry.path,
						field: 'snapshot.domain',
						message: `Per-domain snapshot drift${sections}${issueNote} — run with --update-snapshots to refresh`,
						severity: 'warning',
						code: 'DOCTOR_SNAPSHOT_DOMAIN_DRIFT',
					});
					warnings += 1;
				}
			}
		}

		const perDomainOk = perDomain.every(entry => entry.ok);
		const driftGate =
			options.failOnDrift && !updateSnapshots
				? evaluateSnapshotDriftGate(perDomain, parseSnapshotDriftSections(options.driftSections), {
						policy: snapshotPolicy,
					})
				: undefined;
		const compatibilityGate =
			options.failOnDrift && !updateSnapshots
				? evaluateSnapshotCompatibilityGate(perDomain)
				: undefined;

		const historyStore = await SnapshotHistoryStore.open(snapshotRoot);
		try {
			const timestamp = new Date().toISOString();
			for (const entry of perDomain) {
				historyStore.append({
					id: newSnapshotHistoryId(),
					domain: entry.domain,
					fingerprint: entry.fingerprint,
					previousFingerprint: entry.previousFingerprint,
					changedSections: entry.changedSections,
					operation: updateSnapshots ? 'write' : 'compare',
					timestamp,
				});
			}
		} finally {
			historyStore.close();
		}

		snapshotReport = {
			ok: (comparison.ok && perDomainOk) || updateSnapshots,
			updateRequested: updateSnapshots,
			matcherAvailable: snapshotRuntime.matcherAvailable,
			written,
			compared: !updateSnapshots && (previous !== null || perDomain.some(entry => !entry.missing)),
			missing: comparison.missing,
			changed: comparison.changed,
			extra: comparison.extra,
			perDomain,
			snapshotRoot,
			driftGate,
			compatibilityGate,
			document,
		};
	}

	const result = {
		ok: errors === 0 && files.length > 0,
		domains,
		errors,
		warnings,
		crossDomainIssues,
		peerMetaIssues,
		runtime,
		templateCoverage,
		matrix: matrixReport,
		packageMetadata,
		snapshotRuntime: collectSnapshot ? snapshotRuntime : undefined,
		snapshot: snapshotReport,
	};

	const logged = await emitDoctorResultIssues(root, domains, crossDomainIssues, peerMetaIssues);
	crossDomainIssues = logged.crossDomainIssues;
	peerMetaIssues = logged.peerMetaIssues;

	return {...result, crossDomainIssues, peerMetaIssues};
}

function runCrossDomainChecks(domainSecrets: Map<string, Set<string>>): DoctorIssue[] {
	const issues: DoctorIssue[] = [];
	const nameDomains = new Map<string, string[]>();

	for (const [domain, names] of domainSecrets) {
		for (const name of names) {
			const domains = nameDomains.get(name) ?? [];
			domains.push(domain);
			nameDomains.set(name, domains);
		}
	}

	for (const [name, domains] of nameDomains) {
		if (domains.length > 1) {
			issues.push(
				enrichDoctorIssue({
					domain: '*',
					path: '.vault',
					field: `secrets.inventory.${name}`,
					message: `Secret name "${name}" is defined in multiple domains: ${domains.join(', ')}`,
					severity: 'warning',
					code: 'CROSS_DOMAIN_SECRET_DUPLICATE',
				}),
			);
		}
	}

	return issues;
}

export {ERROR_CODES, ISSUE_CATALOG, getIssueCatalogEntry} from '../logging/issue-catalog.ts';
