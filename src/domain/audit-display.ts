import type {AuditEntry} from '../audit/types.ts';
import type {DomainChannels, DomainColors, DomainConfig} from '../config/types.ts';
import {colorizeDomain} from './branding.ts';

export type AuditEntryTone = 'blocked' | 'warn' | 'allowed';

/**
 * Map supply-chain audit entries to domain palette keys for REPL tail output.
 */
export function auditEntryColorKey(entry: AuditEntry): keyof DomainColors | keyof DomainChannels {
	if (!entry.allowed) {
		const hasFatal = entry.advisories.some(advisory => advisory.level === 'fatal');
		return hasFatal ? 'fatal' : 'supplyChain';
	}
	if (entry.advisories.some(advisory => advisory.level === 'warn' || advisory.level === 'fatal')) {
		return 'warn';
	}
	return 'success';
}

export function auditEntryTone(entry: AuditEntry): AuditEntryTone {
	if (!entry.allowed) return 'blocked';
	if (entry.advisories.some(advisory => advisory.level === 'warn' || advisory.level === 'fatal')) {
		return 'warn';
	}
	return 'allowed';
}

/** Colorized one-line JSON for `audit tail` in the interactive shell. */
export function formatColorizedAuditEntry(
	config: Pick<DomainConfig, 'colors' | 'channels'>,
	entry: AuditEntry,
): string {
	const key = auditEntryColorKey(entry);
	const line = JSON.stringify(entry);
	return colorizeDomain(config as DomainConfig, key, line);
}
