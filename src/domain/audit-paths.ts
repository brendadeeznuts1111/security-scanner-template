import type {DomainConfig} from '../config/types.ts';
import {createAuditSink} from '../audit/factory.ts';
import {EncryptedSQLiteSink} from '../audit/encrypted-sqlite-sink.ts';
import type {AuditSink, AuditSinkOptions} from '../audit/types.ts';
import {FEATURE_AUDIT_JSONL, FEATURE_AUDIT_SQLITE} from '../features/index.ts';
import {reverseDnsPathSegment} from './branding.ts';

export type DomainAuditKind = 'jsonl' | 'sqlite';

export interface ResolvedDomainAudit {
	kind: DomainAuditKind;
	path: string;
	options: AuditSinkOptions;
	masterKey?: string | null;
}

/** Default per-domain encrypted JSONL audit path (reverse-DNS segment). */
export function defaultJsonlAuditPath(domain: string): string {
	return `./.security/${reverseDnsPathSegment(domain)}/audit.jsonl.enc`;
}

/** Default per-domain encrypted SQLite audit path (reverse-DNS segment). */
export function defaultSqliteAuditPath(domain: string): string {
	return `./.security/${reverseDnsPathSegment(domain)}/audit.sqlite`;
}

/**
 * Apply default audit.jsonl settings when not explicitly configured.
 */
export function applyAuditDefaults(config: DomainConfig): void {
	if (!config.audit) {
		config.audit = {};
	}

	const jsonl = config.audit.jsonl;
	if (!jsonl?.path) {
		config.audit.jsonl = {
			path: defaultJsonlAuditPath(config.domain),
			masterKey: jsonl?.masterKey ?? null,
			compress: jsonl?.compress ?? false,
			compressionFormat: jsonl?.compressionFormat ?? 'gzip',
		};
	}
}

/**
 * Resolve the active audit backend for a domain (JSONL preferred when enabled).
 */
export function resolveDomainAudit(config: DomainConfig): ResolvedDomainAudit | null {
	const audit = config.audit;
	if (!audit) return null;

	const jsonl = audit.jsonl;
	if (FEATURE_AUDIT_JSONL && jsonl?.path) {
		return {
			kind: 'jsonl',
			path: jsonl.path,
			options: {
				compress: jsonl.compress,
				compressionFormat: jsonl.compressionFormat,
			},
			masterKey: jsonl.masterKey,
		};
	}

	const sqlite = audit.sqlite;
	if (FEATURE_AUDIT_SQLITE && sqlite?.path) {
		return {
			kind: 'sqlite',
			path: sqlite.path,
			options: {
				compress: sqlite.compress,
				compressionFormat: sqlite.compressionFormat,
			},
			masterKey: sqlite.masterKey,
		};
	}

	return null;
}

/** Human-readable audit path for status / matrix output. */
export function resolveDomainAuditPath(config: DomainConfig): string | undefined {
	return resolveDomainAudit(config)?.path;
}

/**
 * Resolve audit encryption key from config (jsonl or sqlite) with AUDIT_MASTER_KEY fallback.
 */
export function resolveDomainAuditMasterKey(
	config: DomainConfig,
	envKey: string | undefined = process.env.AUDIT_MASTER_KEY,
): string | undefined {
	const resolved = resolveDomainAudit(config);
	if (!resolved) return undefined;

	const configured = resolved.masterKey;
	if (typeof configured === 'string' && configured.length > 0) {
		return configured;
	}
	if (configured === null && envKey) {
		return envKey;
	}
	return undefined;
}

export function createDomainAuditSink(config: DomainConfig, masterKey: string): AuditSink | null {
	const resolved = resolveDomainAudit(config);
	if (!resolved) return null;
	return createAuditSink(resolved.path, masterKey, resolved.options);
}

export async function ensureDomainAuditParentDir(config: DomainConfig): Promise<void> {
	const resolved = resolveDomainAudit(config);
	if (!resolved) return;
	await EncryptedSQLiteSink.ensureParentDir(resolved.path);
}
