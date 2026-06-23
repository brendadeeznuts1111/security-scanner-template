import path from 'path';

/** Reverse-DNS domain identifier (matches config doctor). */
export const REVERSE_DNS_PATTERN = /^[a-zA-Z0-9][-a-zA-Z0-9.]*$/;

/** Domain config filename suffix under `domains/`. */
export const DOMAIN_CONFIG_SUFFIX = '.security.json5';

/**
 * Kebab-case secret inventory names (`threat-feed-api-key`).
 * Lowercase start; letters, digits, and hyphens only.
 */
export const SECRET_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Bun test description strings: lowercase lead, plain-language sentence.
 * CamelCase API identifiers are allowed after the first character.
 * No `should`/`SHOULD` prefixes.
 */
export const TEST_DESCRIPTION_PATTERN = /^[a-zA-Z][a-zA-Z0-9\s.,;:'"()\-–—/&_:>]+$/;

/** CLI-flag-led test titles (`--healthcheck prints JSON status`). */
export const TEST_CLI_FLAG_DESCRIPTION_PATTERN = /^--[a-z][-a-z0-9]* .+$/;

/** Shell-expression-led test titles (`$.cwd() rejects …`, `[[ -f path ]]`). */
export const TEST_SHELL_DESCRIPTION_PATTERN = /^(?:\$\.|\[\[).+$/;

/** Test files under `tests/` must use this suffix. */
export const TEST_FILE_SUFFIX = '.test.ts';

export function isReverseDnsDomain(domain: string): boolean {
	return REVERSE_DNS_PATTERN.test(domain);
}

export function expectedDomainConfigFilename(domain: string): string {
	return `${domain}${DOMAIN_CONFIG_SUFFIX}`;
}

export function expectedDomainConfigBasename(domain: string): string {
	return expectedDomainConfigFilename(domain);
}

/**
 * Validate `domains/<domain>.security.json5` basename matches config.domain.
 */
export function validateDomainConfigPath(
	domain: string,
	filePath: string,
): {ok: boolean; expected: string; actual: string; message?: string} {
	const expected = expectedDomainConfigBasename(domain);
	const actual = path.basename(filePath);
	if (actual === expected) {
		return {ok: true, expected, actual};
	}
	return {
		ok: false,
		expected,
		actual,
		message: `Domain file must be named ${expected}, got ${actual}`,
	};
}

export function isValidSecretName(name: string): boolean {
	return SECRET_NAME_PATTERN.test(name);
}

export function isValidTestDescription(description: string): boolean {
	const trimmed = description.trim();
	if (trimmed.length < 8) return false;
	if (/^should\b/i.test(trimmed)) return false;
	if (/^[A-Z0-9_]+$/.test(trimmed)) return false;
	if (TEST_CLI_FLAG_DESCRIPTION_PATTERN.test(trimmed)) return true;
	if (TEST_SHELL_DESCRIPTION_PATTERN.test(trimmed)) return true;
	return TEST_DESCRIPTION_PATTERN.test(trimmed);
}

export function isValidTestFilePath(filePath: string): boolean {
	return filePath.endsWith(TEST_FILE_SUFFIX) && !filePath.includes('node_modules');
}
