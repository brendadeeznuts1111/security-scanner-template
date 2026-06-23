import {isReverseDnsDomain, reverseDnsPathSegment} from '../domain/branding.ts';

/** Minimal issue shape for catalog enrichment (avoids doctor ↔ catalog import cycle). */
export interface CatalogIssue {
	domain: string;
	path: string;
	field: string;
	message: string;
	severity: 'error' | 'warning';
	code?: string;
	scope?: IssueScope;
	location?: string;
	channel?: string;
	coreSegment?: string;
	logSegment?: string;
}
import {CONFIG_FORMAT_ISSUE_CODES} from '../utils/config-format-runtime.ts';
import {INSTALL_ISSUE_CODES} from '../utils/install-runtime.ts';
import {IMPLICIT_OPTIONAL_PEER_CODE} from '../supply-chain/peer-meta.ts';

export type IssueScope = 'domain' | 'core';

export type CoreLogSegment = 'core' | 'lib' | 'install' | 'config' | 'runtime' | 'template';

export interface IssueCatalogEntry {
	code: string;
	defaultSeverity: 'fatal' | 'warn' | 'info' | 'error' | 'warning';
	defaultChannel: string;
	description: string;
	scope: IssueScope;
	/** Config field path, glob, or module anchor for pane filters. */
	location: string;
	/** Subdirectory under `.security/` when scope is `core`. */
	coreSegment?: CoreLogSegment;
}

/** Runtime / service error codes (domain-scoped at emit time). */
export const RUNTIME_ERROR_CODES: IssueCatalogEntry[] = [
	{
		code: 'VAULT_MISSING',
		defaultSeverity: 'fatal',
		defaultChannel: 'vault',
		description: 'Required secret not found in vault',
		scope: 'domain',
		location: 'secrets.inventory',
	},
	{
		code: 'VAULT_UNREACHABLE',
		defaultSeverity: 'fatal',
		defaultChannel: 'vault',
		description: 'OS credential store is unreachable',
		scope: 'domain',
		location: 'secrets.service',
	},
	{
		code: 'TOKEN_EXPIRED',
		defaultSeverity: 'warn',
		defaultChannel: 'token',
		description: 'Token has expired',
		scope: 'domain',
		location: 'token.ttlSeconds',
	},
	{
		code: 'TOKEN_INVALID',
		defaultSeverity: 'fatal',
		defaultChannel: 'token',
		description: 'Token signature or payload invalid',
		scope: 'domain',
		location: 'token.algorithm',
	},
	{
		code: 'IDENTITY_WEAK_PASSWORD',
		defaultSeverity: 'warn',
		defaultChannel: 'identity',
		description: 'Password does not meet policy',
		scope: 'domain',
		location: 'identity.minLength',
	},
	{
		code: 'CSRF_MISSING',
		defaultSeverity: 'fatal',
		defaultChannel: 'csrf',
		description: 'CSRF token missing from request',
		scope: 'domain',
		location: 'csrf.enabled',
	},
	{
		code: 'CSRF_MISMATCH',
		defaultSeverity: 'fatal',
		defaultChannel: 'csrf',
		description: 'CSRF token does not match session',
		scope: 'domain',
		location: 'csrf.mode',
	},
	{
		code: 'SUPPLY_CHAIN_FATAL',
		defaultSeverity: 'fatal',
		defaultChannel: 'supplyChain',
		description: 'Blocked package in dependency tree',
		scope: 'domain',
		location: 'supplyChain.policy.fatal',
	},
	{
		code: 'SUPPLY_CHAIN_WARN',
		defaultSeverity: 'warn',
		defaultChannel: 'supplyChain',
		description: 'Warning-level package in dependency tree',
		scope: 'domain',
		location: 'supplyChain.policy.warn',
	},
	{
		code: 'POLICY_CONSTRAINT',
		defaultSeverity: 'error',
		defaultChannel: 'supplyChain',
		description: 'Package allow/block/require constraint violated',
		scope: 'domain',
		location: 'policy.constraints',
	},
	{
		code: 'POLICY_CONSTRAINT_LICENSE',
		defaultSeverity: 'error',
		defaultChannel: 'supplyChain',
		description: 'Installed package license blocked by policy',
		scope: 'domain',
		location: 'policy.constraints.blockLicense',
	},
	{
		code: 'POLICY_CONSTRAINT_SOURCE',
		defaultSeverity: 'error',
		defaultChannel: 'supplyChain',
		description: 'Dependency specifier uses a blocked source (git/file/http)',
		scope: 'domain',
		location: 'policy.constraints.blockSource',
	},
	{
		code: 'POLICY_CONSTRAINT_IMPORT',
		defaultSeverity: 'error',
		defaultChannel: 'supplyChain',
		description: 'Source file imports a blocked module specifier',
		scope: 'domain',
		location: 'policy.constraints.blockImport',
	},
	{
		code: 'ENDPOINT_PROBE',
		defaultSeverity: 'error',
		defaultChannel: 'intel',
		description: 'HTTP endpoint meta probe failed security or status checks',
		scope: 'domain',
		location: 'intel.endpoints',
	},
	{
		code: 'FEED_UNREACHABLE',
		defaultSeverity: 'warn',
		defaultChannel: 'supplyChain',
		description: 'Threat feed could not be reached',
		scope: 'domain',
		location: 'supplyChain.feed.remote',
	},
	{
		code: 'OPS_WATCH_FAILURE',
		defaultSeverity: 'warn',
		defaultChannel: 'ops',
		description: 'Watch mode encountered an error',
		scope: 'domain',
		location: 'ops.watch',
	},
];

/** Doctor / config validation codes. */
export const DOCTOR_ISSUE_CODES: IssueCatalogEntry[] = [
	{
		code: 'DOMAIN_FILENAME_MISMATCH',
		defaultSeverity: 'error',
		defaultChannel: 'ops',
		description: 'Domain config filename must match reverse-DNS domain id',
		scope: 'domain',
		location: 'domains/*.security.json5',
	},
	{
		code: 'SECRETS_SERVICE_MISMATCH',
		defaultSeverity: 'error',
		defaultChannel: 'vault',
		description: 'secrets.service must match domain id',
		scope: 'domain',
		location: 'secrets.service',
	},
	{
		code: 'TOKEN_ISSUER_MISMATCH',
		defaultSeverity: 'warning',
		defaultChannel: 'token',
		description: 'token.issuer should match domain id',
		scope: 'domain',
		location: 'token.issuer',
	},
	{
		code: 'SECRET_NAME_INVALID',
		defaultSeverity: 'error',
		defaultChannel: 'vault',
		description: 'Secret inventory name must be kebab-case',
		scope: 'domain',
		location: 'secrets.inventory.*',
	},
	{
		code: 'AUDIT_MASTER_KEY_MISSING',
		defaultSeverity: 'warning',
		defaultChannel: 'vault',
		description: 'Audit path configured without master key',
		scope: 'domain',
		location: 'audit.jsonl.masterKey',
	},
	{
		code: 'INTERACTIVE_NON_TTY',
		defaultSeverity: 'warning',
		defaultChannel: 'ops',
		description: 'Interactive service requires a TTY',
		scope: 'domain',
		location: 'service.interactive',
	},
	{
		code: 'SYSTEM_CA_AVAILABLE',
		defaultSeverity: 'warning',
		defaultChannel: 'ops',
		description: 'System CA trust store unavailable',
		scope: 'domain',
		location: 'tls.useSystemCA',
	},
	{
		code: 'UNKNOWN_ERROR_OVERRIDE',
		defaultSeverity: 'warning',
		defaultChannel: 'ops',
		description: 'errorOverrides references an unknown catalog code',
		scope: 'domain',
		location: 'errorOverrides.*',
	},
	{
		code: 'CROSS_DOMAIN_SECRET_DUPLICATE',
		defaultSeverity: 'warning',
		defaultChannel: 'vault',
		description: 'Same secret name defined in multiple domains',
		scope: 'core',
		location: '.vault',
		coreSegment: 'core',
	},
	{
		code: 'TEMPLATE_FIELD_MISSING',
		defaultSeverity: 'error',
		defaultChannel: 'ops',
		description: 'Golden template missing catalog fields',
		scope: 'core',
		location: 'templates/domain.template.json5',
		coreSegment: 'template',
	},
	{
		code: 'WINDOWS_RUNTIME_UPGRADE',
		defaultSeverity: 'warning',
		defaultChannel: 'ops',
		description: 'Windows Bun runtime below recommended fix level',
		scope: 'core',
		location: 'src/utils/platform-runtime.ts',
		coreSegment: 'runtime',
	},
	{
		code: 'BUN_TYPES_TSGo',
		defaultSeverity: 'warning',
		defaultChannel: 'ops',
		description: 'bun-types below tsgo-compatible floor',
		scope: 'core',
		location: 'package.json#devDependencies.bun-types',
		coreSegment: 'lib',
	},
	{
		code: 'PIPELINE_PAGER_TERMIOS',
		defaultSeverity: 'warning',
		defaultChannel: 'ops',
		description: 'Piped stdout may break pager raw mode',
		scope: 'core',
		location: 'src/utils/terminal-io.ts',
		coreSegment: 'runtime',
	},
	{
		code: 'MACOS_SYSTEM_CA_SLOW',
		defaultSeverity: 'warning',
		defaultChannel: 'ops',
		description: 'macOS system CA enumeration slow',
		scope: 'core',
		location: 'src/intel/tls/system-ca.ts',
		coreSegment: 'runtime',
	},
	{
		code: 'RUNTIME_API_MISSING',
		defaultSeverity: 'error',
		defaultChannel: 'ops',
		description: 'Required Bun APIs missing from runtime',
		scope: 'core',
		location: 'src/utils/runtime.ts',
		coreSegment: 'runtime',
	},
	{
		code: 'DOCTOR_SNAPSHOT_MISSING',
		defaultSeverity: 'warning',
		defaultChannel: 'ops',
		description: 'Doctor snapshot baseline missing',
		scope: 'core',
		location: '.security/snapshots/doctor',
		coreSegment: 'template',
	},
	{
		code: 'DOCTOR_SNAPSHOT_DRIFT',
		defaultSeverity: 'warning',
		defaultChannel: 'ops',
		description: 'Doctor snapshot index drift',
		scope: 'core',
		location: '.security/snapshots/doctor/index.json',
		coreSegment: 'template',
	},
	{
		code: 'DOCTOR_SNAPSHOT_DOMAIN_MISSING',
		defaultSeverity: 'warning',
		defaultChannel: 'ops',
		description: 'Per-domain doctor snapshot baseline missing',
		scope: 'domain',
		location: '.security/snapshots/doctor/<domain>.json',
	},
	{
		code: 'DOCTOR_SNAPSHOT_DOMAIN_DRIFT',
		defaultSeverity: 'warning',
		defaultChannel: 'ops',
		description: 'Per-domain doctor snapshot drift',
		scope: 'domain',
		location: '.security/snapshots/doctor/<domain>.json',
	},
	{
		code: IMPLICIT_OPTIONAL_PEER_CODE,
		defaultSeverity: 'warning',
		defaultChannel: 'supplyChain',
		description: 'Implicit optional peer from peerDependenciesMeta only',
		scope: 'core',
		location: 'node_modules/**/package.json#peerDependenciesMeta',
		coreSegment: 'lib',
	},
	...Object.values(INSTALL_ISSUE_CODES).map(
		(code): IssueCatalogEntry => ({
			code,
			defaultSeverity: 'warning',
			defaultChannel: 'ops',
			description: 'Bun install / lockfile diagnostic',
			scope: 'core',
			location: 'bun.lock',
			coreSegment: 'install',
		}),
	),
	...Object.values(CONFIG_FORMAT_ISSUE_CODES).map(
		(code): IssueCatalogEntry => ({
			code,
			defaultSeverity: 'warning',
			defaultChannel: 'ops',
			description: 'Config format separation diagnostic',
			scope: 'core',
			location: 'domains/*.security.json5',
			coreSegment: 'config',
		}),
	),
];

export const ISSUE_CATALOG: readonly IssueCatalogEntry[] = [
	...RUNTIME_ERROR_CODES,
	...DOCTOR_ISSUE_CODES,
] as const;

const CATALOG_MAP = new Map(ISSUE_CATALOG.map(entry => [entry.code, entry]));

/** Runtime service codes — subset of ISSUE_CATALOG. */
export const ERROR_CODES = RUNTIME_ERROR_CODES;

export const ERROR_CODE_MAP = CATALOG_MAP;

export function getIssueCatalogEntry(code: string | undefined): IssueCatalogEntry | undefined {
	if (!code) return undefined;
	return CATALOG_MAP.get(code);
}

export function getErrorCode(code: string): IssueCatalogEntry | undefined {
	return CATALOG_MAP.get(code);
}

const PSEUDO_DOMAIN_SEGMENTS: Record<string, CoreLogSegment> = {
	'*': 'core',
	'install': 'install',
	'config': 'config',
	'supply-chain': 'lib',
};

export function isDomainScopedId(domain: string): boolean {
	return domain !== '*' && isReverseDnsDomain(domain);
}

export function resolveIssueScope(
	issue: Pick<CatalogIssue, 'domain' | 'code'>,
	catalog?: IssueCatalogEntry,
): IssueScope {
	if (catalog?.scope) return catalog.scope;
	if (isDomainScopedId(issue.domain)) return 'domain';
	return 'core';
}

export function resolveCoreSegment(
	issue: Pick<CatalogIssue, 'domain' | 'code' | 'field'>,
	catalog?: IssueCatalogEntry,
): CoreLogSegment {
	if (catalog?.coreSegment) return catalog.coreSegment;
	const pseudo = PSEUDO_DOMAIN_SEGMENTS[issue.domain];
	if (pseudo) return pseudo;
	if (issue.code?.startsWith('INSTALL_')) return 'install';
	if (issue.code?.startsWith('CONFIG_')) return 'config';
	if (issue.code?.startsWith('DOCTOR_SNAPSHOT')) return 'template';
	if (issue.field.startsWith('runtime')) return 'runtime';
	return 'core';
}

export interface EnrichedDoctorIssue extends CatalogIssue {
	scope: IssueScope;
	location: string;
	channel: string;
	coreSegment?: CoreLogSegment;
	/** Filesystem segment for mirror path (reverse-DNS or core segment). */
	logSegment: string;
}

export function enrichDoctorIssue(issue: CatalogIssue): EnrichedDoctorIssue {
	const catalog = getIssueCatalogEntry(issue.code);
	const scope = issue.scope ?? resolveIssueScope(issue, catalog);
	const location = issue.location ?? catalog?.location ?? issue.field ?? 'unknown';
	const channel = issue.channel ?? catalog?.defaultChannel ?? 'ops';
	const coreSegment: CoreLogSegment | undefined =
		(issue.coreSegment as CoreLogSegment | undefined) ??
		(scope === 'core' ? resolveCoreSegment(issue, catalog) : undefined);
	const logSegment =
		issue.logSegment ??
		(scope === 'domain' && isDomainScopedId(issue.domain)
			? reverseDnsPathSegment(issue.domain)
			: (coreSegment ?? 'core'));

	return {
		...issue,
		scope,
		location,
		channel,
		coreSegment,
		logSegment,
	};
}

export function operatorMirrorLogPath(
	root: string,
	issue: Pick<EnrichedDoctorIssue, 'scope' | 'logSegment'>,
): string {
	return `${root}/.security/${issue.logSegment}/issues.jsonl`;
}

export function operatorMasterLogPath(root: string): string {
	return `${root}/.security/operator.jsonl`;
}
