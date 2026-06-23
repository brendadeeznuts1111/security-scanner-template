import type {DomainConfig} from '../config/types.ts';
import {TEMPLATE_PATH, loadTemplate} from '../config/loader.ts';
import {domainBrandingProfile, type DomainBrandingProfile} from './branding.ts';
import {resolveSecretsService} from './secrets-service.ts';

export type DomainFieldSection =
	| 'domain'
	| 'branding'
	| 'secrets'
	| 'identity'
	| 'token'
	| 'csrf'
	| 'supply-chain'
	| 'service'
	| 'visual'
	| 'ops'
	| 'audit'
	| 'intel'
	| 'tls'
	| 'errors';

export interface DomainFieldFlags {
	/** Documented in templates/domain.template.json5. */
	template: boolean;
	/** Part of the DomainConfig schema (always true for catalog rows). */
	domain: boolean;
	/** Drives terminal/report/QR/badge presentation. */
	branding: boolean;
	/** Consumed by Service / bun sp start runtime. */
	service: boolean;
	/** Stored or read via Bun.secrets. */
	secrets: boolean;
}

export interface DomainFieldRow {
	field: string;
	section: DomainFieldSection;
	flags: DomainFieldFlags;
	description: string;
	bunApi?: string;
	cli?: string;
}

export interface DomainFieldValueRow extends DomainFieldRow {
	value: string;
	source: 'config' | 'default' | 'derived';
}

export interface FieldMatrixOptions {
	section?: DomainFieldSection;
	onlySet?: boolean;
}

const MATRIX_COLUMNS = ['field', 'template', 'domain', 'branding', 'service', 'secrets'] as const;

/**
 * Canonical catalog of every domain config field and how it maps across layers.
 */
export const DOMAIN_FIELD_MATRIX: readonly DomainFieldRow[] = [
	{
		field: 'domain',
		section: 'domain',
		flags: {template: true, domain: true, branding: true, service: true, secrets: true},
		description: 'Reverse-DNS identifier; Bun.secrets service namespace',
		bunApi: 'Bun.secrets',
		cli: 'sp shell, sp doctor',
	},
	{
		field: 'displayName',
		section: 'branding',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Human-facing label for REPL, reports, badges',
		cli: 'sp shell',
	},
	{
		field: 'description',
		section: 'branding',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'One-line domain summary in shell banner',
	},
	{
		field: 'colors.primary',
		section: 'branding',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Primary brand + badge tint',
		bunApi: 'Bun.color',
		cli: 'sp shell colors',
	},
	{
		field: 'colors.secondary',
		section: 'branding',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Secondary palette',
		bunApi: 'Bun.color',
	},
	{
		field: 'colors.fatal',
		section: 'branding',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Fatal severity color',
		bunApi: 'Bun.color',
	},
	{
		field: 'colors.warn',
		section: 'branding',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Warning severity color',
		bunApi: 'Bun.color',
	},
	{
		field: 'colors.info',
		section: 'branding',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Info channel color',
		bunApi: 'Bun.color',
	},
	{
		field: 'colors.success',
		section: 'branding',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Success channel color',
		bunApi: 'Bun.color',
	},
	{
		field: 'channels.vault',
		section: 'branding',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Vault/secret log channel',
		bunApi: 'Bun.color',
		cli: 'sp shell secrets',
	},
	{
		field: 'channels.identity',
		section: 'branding',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Identity/password channel',
		bunApi: 'Bun.color',
	},
	{
		field: 'channels.token',
		section: 'branding',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Token/signing channel; default QR dark modules',
		bunApi: 'Bun.color',
		cli: 'sp qr',
	},
	{
		field: 'channels.csrf',
		section: 'branding',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'CSRF channel',
		bunApi: 'Bun.color',
	},
	{
		field: 'channels.supplyChain',
		section: 'branding',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Supply-chain scan channel',
		bunApi: 'Bun.color',
	},
	{
		field: 'channels.ops',
		section: 'branding',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Operational log channel',
		bunApi: 'Bun.color',
	},
	{
		field: 'secrets.service',
		section: 'secrets',
		flags: {template: true, domain: true, branding: true, service: false, secrets: true},
		description: 'Bun.secrets service key (always synced to domain)',
		bunApi: 'Bun.secrets',
		cli: 'sp shell secrets',
	},
	{
		field: 'secrets.allowUnrestrictedAccess',
		section: 'secrets',
		flags: {template: true, domain: true, branding: false, service: false, secrets: true},
		description: 'Default credential ACL for inventory writes',
		bunApi: 'Bun.secrets',
	},
	{
		field: 'secrets.inventory',
		section: 'secrets',
		flags: {template: true, domain: true, branding: false, service: false, secrets: true},
		description: 'Named secret inventory (prefer private .vault/)',
		bunApi: 'Bun.secrets',
		cli: 'sp shell secrets',
	},
	{
		field: 'secrets.inventoryFile',
		section: 'secrets',
		flags: {template: true, domain: true, branding: false, service: false, secrets: true},
		description: 'External inventory file (.enc requires VAULT_MASTER_KEY)',
	},
	{
		field: 'identity.algorithm',
		section: 'identity',
		flags: {template: true, domain: true, branding: false, service: false, secrets: false},
		description: 'Password hash algorithm',
		bunApi: 'Bun.password',
	},
	{
		field: 'identity.minLength',
		section: 'identity',
		flags: {template: true, domain: true, branding: false, service: false, secrets: false},
		description: 'Minimum password length',
	},
	{
		field: 'identity.requireSpecialChar',
		section: 'identity',
		flags: {template: true, domain: true, branding: false, service: false, secrets: false},
		description: 'Require special characters',
	},
	{
		field: 'identity.cost',
		section: 'identity',
		flags: {template: true, domain: true, branding: false, service: false, secrets: false},
		description: 'Bcrypt cost factor (4–31)',
	},
	{
		field: 'token.algorithm',
		section: 'token',
		flags: {template: true, domain: true, branding: false, service: false, secrets: false},
		description: 'JWT/signing algorithm',
	},
	{
		field: 'token.ttlSeconds',
		section: 'token',
		flags: {template: true, domain: true, branding: false, service: false, secrets: false},
		description: 'Token time-to-live',
	},
	{
		field: 'token.issuer',
		section: 'token',
		flags: {template: true, domain: true, branding: false, service: false, secrets: false},
		description: 'Token issuer claim (always synced to domain)',
	},
	{
		field: 'csrf.enabled',
		section: 'csrf',
		flags: {template: true, domain: true, branding: false, service: true, secrets: true},
		description: 'Enable Bun.CSRF protection',
		bunApi: 'Bun.CSRF',
		cli: 'bun run csrf',
	},
	{
		field: 'csrf.tokenLength',
		section: 'csrf',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'CSRF token byte length',
	},
	{
		field: 'csrf.mode',
		section: 'csrf',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'stateless or session-bound tokens',
		bunApi: 'Bun.CSRF',
	},
	{
		field: 'csrf.encoding',
		section: 'csrf',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Token encoding (base64url, hex, …)',
		bunApi: 'Bun.CSRF',
	},
	{
		field: 'csrf.algorithm',
		section: 'csrf',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'HMAC/hash algorithm',
		bunApi: 'Bun.CSRF',
	},
	{
		field: 'csrf.cookieName',
		section: 'csrf',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'CSRF cookie name',
	},
	{
		field: 'csrf.headerName',
		section: 'csrf',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'CSRF header name',
	},
	{
		field: 'csrf.sessionCookieName',
		section: 'csrf',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Session cookie for session-bound mode',
	},
	{
		field: 'csrf.expiresIn',
		section: 'csrf',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Token TTL in ms (Bun.CSRF expiresIn)',
	},
	{
		field: 'csrf.maxAge',
		section: 'csrf',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Max verify age in ms',
	},
	{
		field: 'supplyChain.enabled',
		section: 'supply-chain',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Enable supply-chain scanning',
	},
	{
		field: 'supplyChain.feed.remote',
		section: 'supply-chain',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Remote threat feed URL',
		cli: 'scan',
	},
	{
		field: 'supplyChain.feed.local',
		section: 'supply-chain',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Local threat feed path',
	},
	{
		field: 'supplyChain.feed.apiKeyVault',
		section: 'supply-chain',
		flags: {template: true, domain: true, branding: false, service: true, secrets: true},
		description: 'Bun.secrets name for feed bearer token',
		bunApi: 'Bun.secrets',
	},
	{
		field: 'supplyChain.feed.apiKeyService',
		section: 'supply-chain',
		flags: {template: true, domain: true, branding: false, service: true, secrets: true},
		description: 'Bun.secrets service for feed token (defaults to domain)',
	},
	{
		field: 'supplyChain.feed.cachePath',
		section: 'supply-chain',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Threat feed disk cache',
	},
	{
		field: 'supplyChain.feed.cacheTtl',
		section: 'supply-chain',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Feed cache TTL seconds',
	},
	{
		field: 'supplyChain.feed.protocol',
		section: 'supply-chain',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'HTTP/2 or HTTP/3 fetch protocol',
	},
	{
		field: 'supplyChain.policy.fatal',
		section: 'supply-chain',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Fatal threat categories',
	},
	{
		field: 'supplyChain.policy.warn',
		section: 'supply-chain',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Warning threat categories',
	},
	{
		field: 'service.interactive',
		section: 'service',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'PTY for external scanners',
		bunApi: 'Bun.spawn({ terminal })',
		cli: 'sp shell scan',
	},
	{
		field: 'service.port',
		section: 'service',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Listen port for bun sp start',
		cli: 'sp start',
	},
	{
		field: 'service.hostname',
		section: 'service',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Bind hostname',
		cli: 'sp start',
	},
	{
		field: 'service.http3',
		section: 'service',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Enable QUIC / HTTP/3',
		bunApi: 'Bun.serve',
		cli: 'sp start --http3',
	},
	{
		field: 'service.http1',
		section: 'service',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Serve HTTP/1.1 alongside HTTP/3',
		bunApi: 'Bun.serve',
	},
	{
		field: 'service.tls.cert',
		section: 'service',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'TLS certificate path for Bun.serve',
		bunApi: 'Bun.serve',
	},
	{
		field: 'service.tls.key',
		section: 'service',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'TLS private key path',
		bunApi: 'Bun.serve',
	},
	{
		field: 'service.tls.ca',
		section: 'service',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Optional CA bundle for mTLS',
	},
	{
		field: 'visual.qr.enabled',
		section: 'visual',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Master-token QR generation',
		bunApi: 'Bun.Image',
		cli: 'sp qr',
	},
	{
		field: 'ops.watch.debounceMs',
		section: 'ops',
		flags: {template: true, domain: true, branding: false, service: false, secrets: false},
		description: 'Config watch debounce',
		cli: 'watch',
	},
	{
		field: 'ops.watch.report',
		section: 'ops',
		flags: {template: true, domain: true, branding: false, service: false, secrets: false},
		description: 'Watch-triggered report path',
	},
	{
		field: 'ops.watch.output',
		section: 'ops',
		flags: {template: true, domain: true, branding: false, service: false, secrets: false},
		description: 'Watch-triggered output directory',
	},
	{
		field: 'ops.report.format',
		section: 'ops',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Report format (markdown|html|json)',
		cli: 'report',
	},
	{
		field: 'ops.report.output',
		section: 'ops',
		flags: {template: true, domain: true, branding: false, service: false, secrets: false},
		description: 'Report output directory',
	},
	{
		field: 'ops.report.operatorQr.enabled',
		section: 'ops',
		flags: {template: true, domain: true, branding: true, service: false, secrets: true},
		description: 'Embed vault QR in HTML reports',
		bunApi: 'Bun.Image',
		cli: 'report',
	},
	{
		field: 'ops.report.operatorQr.size',
		section: 'ops',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Operator QR pixel size',
	},
	{
		field: 'ops.report.operatorQr.dark',
		section: 'ops',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Operator QR module color',
	},
	{
		field: 'ops.report.operatorQr.light',
		section: 'ops',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Operator QR background color',
	},
	{
		field: 'audit.jsonl.path',
		section: 'audit',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Per-domain encrypted JSONL audit path (preferred)',
		cli: 'sp shell audit tail',
	},
	{
		field: 'audit.jsonl.masterKey',
		section: 'audit',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'JSONL audit encryption key (or AUDIT_MASTER_KEY)',
	},
	{
		field: 'audit.jsonl.compress',
		section: 'audit',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Compress encrypted JSONL audit payloads',
	},
	{
		field: 'audit.jsonl.compressionFormat',
		section: 'audit',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'gzip or zstd compression for JSONL audit',
	},
	{
		field: 'audit.sqlite.path',
		section: 'audit',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Encrypted audit SQLite path (fallback when JSONL disabled)',
		bunApi: 'bun:sqlite',
	},
	{
		field: 'audit.sqlite.masterKey',
		section: 'audit',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'SQLite audit encryption key (or AUDIT_MASTER_KEY)',
	},
	{
		field: 'audit.sqlite.compress',
		section: 'audit',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Compress encrypted SQLite audit payloads',
	},
	{
		field: 'audit.sqlite.compressionFormat',
		section: 'audit',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'gzip or zstd compression for SQLite audit',
	},
	{
		field: 'intel.dns.blocklist',
		section: 'intel',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'DNS threat blocklist domains',
	},
	{
		field: 'intel.dns.requireResolution',
		section: 'intel',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Require DNS resolution for feed hosts',
	},
	{
		field: 'intel.dns.suspiciousTtlThreshold',
		section: 'intel',
		flags: {template: true, domain: true, branding: false, service: true, secrets: false},
		description: 'Flag suspiciously low TTLs',
	},
	{
		field: 'tls.useSystemCA',
		section: 'tls',
		flags: {template: true, domain: true, branding: false, service: false, secrets: false},
		description: 'Validate remote TLS with OS trust store',
		bunApi: 'tls.getCACertificates',
		cli: 'sp tls',
	},
	{
		field: 'errorOverrides',
		section: 'errors',
		flags: {template: true, domain: true, branding: true, service: false, secrets: false},
		description: 'Per-code severity/channel overrides',
		cli: 'sp doctor',
	},
] as const;

function flagMark(on: boolean): string {
	return on ? 'yes' : '·';
}

function pad(value: string, width: number): string {
	if (value.length > width) {
		return value.slice(0, width - 1) + '…';
	}
	return value.padEnd(width);
}

function getByPath(config: DomainConfig, field: string): unknown {
	const parts = field.split('.');
	let current: unknown = config;
	for (const part of parts) {
		if (current === null || current === undefined || typeof current !== 'object') {
			return undefined;
		}
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

function formatValue(value: unknown): string {
	if (value === undefined) return '(unset)';
	if (value === null) return 'null';
	if (typeof value === 'string') return value.length > 48 ? `${value.slice(0, 45)}…` : value;
	if (typeof value === 'boolean' || typeof value === 'number') return String(value);
	if (Array.isArray(value)) return `[${value.length}]`;
	if (typeof value === 'object') {
		const keys = Object.keys(value as Record<string, unknown>);
		return keys.length === 0
			? '{}'
			: `{${keys.slice(0, 3).join(',')}${keys.length > 3 ? ',…' : ''}}`;
	}
	return String(value);
}

/**
 * Rows with resolved values from a loaded domain config.
 */
export function domainFieldValueRows(
	config: DomainConfig,
	options: FieldMatrixOptions = {},
): DomainFieldValueRow[] {
	let rows = DOMAIN_FIELD_MATRIX.map(row => {
		let value: string;
		let source: DomainFieldValueRow['source'] = 'config';

		if (row.field === 'secrets.service') {
			value = resolveSecretsService(config);
			source = 'derived';
		} else {
			value = formatValue(getByPath(config, row.field));
		}

		return {...row, value, source};
	});

	if (options.section) {
		rows = rows.filter(row => row.section === options.section);
	}
	if (options.onlySet) {
		rows = rows.filter(row => row.value !== '(unset)' && row.value !== '{}' && row.value !== '[]');
	}
	return rows;
}

/**
 * ASCII matrix table: field × template/domain/branding/service/secrets.
 */
export function formatFieldMatrixTable(
	rows: readonly DomainFieldRow[] = DOMAIN_FIELD_MATRIX,
	options: {includeDescription?: boolean; values?: boolean; valueRows?: DomainFieldValueRow[]} = {},
): string {
	const fieldWidth = 32;
	const flagWidth = 8;
	const header = [
		pad('field', fieldWidth),
		...MATRIX_COLUMNS.slice(1).map(column => pad(column, flagWidth)),
	].join(' ');

	const lines = [header, '-'.repeat(header.length)];
	const valueByField = new Map(
		(options.valueRows ?? []).map(row => [row.field, row.value] as const),
	);

	for (const row of rows) {
		const cells = [
			pad(row.field, fieldWidth),
			pad(flagMark(row.flags.template), flagWidth),
			pad(flagMark(row.flags.domain), flagWidth),
			pad(flagMark(row.flags.branding), flagWidth),
			pad(flagMark(row.flags.service), flagWidth),
			pad(flagMark(row.flags.secrets), flagWidth),
		];
		lines.push(cells.join(' '));
		if (options.values && valueByField.has(row.field)) {
			lines.push(`${' '.repeat(2)}→ ${valueByField.get(row.field)}`);
		}
		if (options.includeDescription) {
			lines.push(`${' '.repeat(2)}${row.description}`);
		}
	}

	return lines.join('\n');
}

/**
 * Branding + service summary lines for shell status / matrix showcase.
 */
export function formatBrandingShowcase(profile: DomainBrandingProfile): string[] {
	return [
		`display: ${profile.displayName}`,
		`domain: ${profile.domain}`,
		`service: ${profile.service}`,
		profile.description ? `description: ${profile.description}` : '',
		`report: ${profile.report.format} → ${profile.report.output}`,
		`qr: ${profile.qr.enabled ? 'enabled' : 'disabled'} dark=${profile.qr.dark} light=${profile.qr.light}`,
		`operatorQr: ${profile.operatorQr.enabled ? 'enabled' : 'disabled'} size=${profile.operatorQr.size}`,
		`colors: primary=${profile.colors.primary} token=${profile.channels.token}`,
		`service.runtime: interactive=${profile.runtime.interactive} http3=${profile.runtime.http3} port=${profile.runtime.port ?? '(default)'}`,
	].filter(line => line.length > 0);
}

/**
 * Ensure the golden template documents every catalog field path.
 */
function fieldDocumentedInTemplate(text: string, field: string): boolean {
	if (text.includes(field)) {
		return true;
	}
	const leaf = field.split('.').pop() ?? field;
	return new RegExp(`\\b${leaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(text);
}

export async function validateTemplateFieldCoverage(
	templateText?: string,
): Promise<{ok: boolean; missing: string[]}> {
	const text = templateText ?? (await Bun.file(TEMPLATE_PATH).text());
	const missing = DOMAIN_FIELD_MATRIX.filter(
		row => row.flags.template && !fieldDocumentedInTemplate(text, row.field),
	).map(row => row.field);
	return {ok: missing.length === 0, missing};
}

export async function loadTemplateFieldMatrix(): Promise<{
	template: DomainConfig;
	rows: DomainFieldValueRow[];
}> {
	const template = await loadTemplate();
	return {template, rows: domainFieldValueRows(template)};
}

export function listFieldMatrixSections(): DomainFieldSection[] {
	return [...new Set(DOMAIN_FIELD_MATRIX.map(row => row.section))];
}

export function filterFieldMatrix(options: FieldMatrixOptions = {}): DomainFieldRow[] {
	let rows = [...DOMAIN_FIELD_MATRIX];
	if (options.section) {
		rows = rows.filter(row => row.section === options.section);
	}
	return rows;
}

/** Count catalog rows tagged for each integration layer. */
export function matrixLayerCounts(
	rows: readonly {flags: DomainFieldFlags}[] = DOMAIN_FIELD_MATRIX,
): Record<(typeof MATRIX_COLUMNS)[number], number> {
	return {
		field: rows.length,
		template: rows.filter(row => row.flags.template).length,
		domain: rows.filter(row => row.flags.domain).length,
		branding: rows.filter(row => row.flags.branding).length,
		service: rows.filter(row => row.flags.service).length,
		secrets: rows.filter(row => row.flags.secrets).length,
	};
}
