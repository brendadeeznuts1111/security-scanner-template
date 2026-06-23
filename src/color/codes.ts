export interface ErrorCode {
	code: string;
	defaultSeverity: 'fatal' | 'warn' | 'info';
	defaultChannel: string;
	description: string;
}

export const ERROR_CODES: ErrorCode[] = [
	{
		code: 'VAULT_MISSING',
		defaultSeverity: 'fatal',
		defaultChannel: 'vault',
		description: 'Required secret not found in vault',
	},
	{
		code: 'VAULT_UNREACHABLE',
		defaultSeverity: 'fatal',
		defaultChannel: 'vault',
		description: 'OS credential store is unreachable',
	},
	{
		code: 'TOKEN_EXPIRED',
		defaultSeverity: 'warn',
		defaultChannel: 'token',
		description: 'Token has expired',
	},
	{
		code: 'TOKEN_INVALID',
		defaultSeverity: 'fatal',
		defaultChannel: 'token',
		description: 'Token signature or payload invalid',
	},
	{
		code: 'IDENTITY_WEAK_PASSWORD',
		defaultSeverity: 'warn',
		defaultChannel: 'identity',
		description: 'Password does not meet policy',
	},
	{
		code: 'CSRF_MISSING',
		defaultSeverity: 'fatal',
		defaultChannel: 'csrf',
		description: 'CSRF token missing from request',
	},
	{
		code: 'CSRF_MISMATCH',
		defaultSeverity: 'fatal',
		defaultChannel: 'csrf',
		description: 'CSRF token does not match session',
	},
	{
		code: 'SUPPLY_CHAIN_FATAL',
		defaultSeverity: 'fatal',
		defaultChannel: 'supplyChain',
		description: 'Blocked package in dependency tree',
	},
	{
		code: 'SUPPLY_CHAIN_WARN',
		defaultSeverity: 'warn',
		defaultChannel: 'supplyChain',
		description: 'Warning-level package in dependency tree',
	},
	{
		code: 'FEED_UNREACHABLE',
		defaultSeverity: 'warn',
		defaultChannel: 'supplyChain',
		description: 'Threat feed could not be reached',
	},
	{
		code: 'OPS_WATCH_FAILURE',
		defaultSeverity: 'warn',
		defaultChannel: 'ops',
		description: 'Watch mode encountered an error',
	},
];

export const ERROR_CODE_MAP = new Map(ERROR_CODES.map(c => [c.code, c]));

export function getErrorCode(code: string): ErrorCode | undefined {
	return ERROR_CODE_MAP.get(code);
}
