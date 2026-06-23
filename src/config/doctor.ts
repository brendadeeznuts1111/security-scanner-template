import {loadTemplate, TEMPLATE_PATH, type LoadedDomain} from './loader.ts';
import {ERROR_CODES, getErrorCode} from '../color/codes.ts';
import type {DomainConfig} from './types.ts';

export interface DoctorIssue {
	domain: string;
	path: string;
	field: string;
	message: string;
	severity: 'error' | 'warning';
}

export interface DoctorResult {
	ok: boolean;
	domains: {domain: string; path: string; ok: boolean; issues: DoctorIssue[]}[];
	errors: number;
	warnings: number;
}

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

function isValidHex(value: unknown): boolean {
	return typeof value === 'string' && HEX_REGEX.test(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(v => typeof v === 'string');
}

function validateDomain(loaded: LoadedDomain): DoctorIssue[] {
	const issues: DoctorIssue[] = [];
	const config = loaded.config;
	const report = (field: string, message: string, severity: 'error' | 'warning' = 'error') => {
		issues.push({domain: config.domain, path: loaded.path, field, message, severity});
	};

	if (!config.domain || config.domain.length === 0) {
		report('domain', 'Domain identifier is required', 'error');
	} else if (!/^[a-zA-Z0-9][-a-zA-Z0-9.]*$/.test(config.domain)) {
		report('domain', 'Domain must be a valid reverse-DNS string', 'error');
	}

	for (const [key, value] of Object.entries(config.colors)) {
		if (!isValidHex(value)) {
			report(`colors.${key}`, `Color must be a 6-digit hex string, got ${value}`, 'error');
		}
	}

	for (const [key, value] of Object.entries(config.channels)) {
		if (!isValidHex(value)) {
			report(
				`channels.${key}`,
				`Channel color must be a 6-digit hex string, got ${value}`,
				'error',
			);
		}
	}

	if (config.secrets.inventory.some((s: {name?: string}) => !s.name || s.name.length === 0)) {
		report('secrets.inventory', 'Every secret entry must have a name', 'error');
	}

	if (config.identity.minLength < 1) {
		report('identity.minLength', 'Minimum password length must be at least 1', 'error');
	}

	if (config.token.ttlSeconds < 1) {
		report('token.ttlSeconds', 'Token TTL must be positive', 'error');
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

	for (const code of Object.keys(config.errorOverrides)) {
		if (!getErrorCode(code)) {
			report(`errorOverrides.${code}`, `Unknown error code "${code}"`, 'warning');
		}
	}

	return issues;
}

/**
 * Validate a single loaded domain.
 */
export function checkDomain(loaded: LoadedDomain): {ok: boolean; issues: DoctorIssue[]} {
	const issues = validateDomain(loaded);
	return {ok: issues.length === 0, issues};
}

/**
 * Validate all domain configs in the project.
 */
export async function checkAllDomains(root: string): Promise<DoctorResult> {
	const {discoverDomainFiles, loadAllDomains} = await import('./loader.ts');
	const files = discoverDomainFiles(root);
	const loaded = await loadAllDomains(root);

	const domains: DoctorResult['domains'] = [];
	let errors = 0;
	let warnings = 0;

	for (const d of loaded) {
		const result = checkDomain(d);
		errors += result.issues.filter(i => i.severity === 'error').length;
		warnings += result.issues.filter(i => i.severity === 'warning').length;
		domains.push({domain: d.domain, path: d.path, ok: result.ok, issues: result.issues});
	}

	if (loaded.length === 0) {
		const template = await loadTemplate();
		const result = checkDomain({domain: template.domain, path: TEMPLATE_PATH, config: template});
		// Only report template issues if no domain files exist.
		errors += result.issues.filter(i => i.severity === 'error').length;
		warnings += result.issues.filter(i => i.severity === 'warning').length;
	}

	return {
		ok: errors === 0 && loaded.length > 0,
		domains,
		errors,
		warnings,
	};
}

export {ERROR_CODES};
