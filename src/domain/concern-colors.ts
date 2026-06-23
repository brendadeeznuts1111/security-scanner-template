import type {DomainChannels, DomainColors, DomainConfig} from '../config/types.ts';
import {ERROR_CODES, getErrorCode, type ErrorCode} from '../color/codes.ts';
import {brightenColor, colorize, normalizeHex, toCss} from '../color/index.ts';
import type {DoctorIssue} from '../config/doctor.ts';

/** ast-grep-style searchable tags on concern → color rules. */
export type ConcernTag =
	| 'security'
	| 'vault'
	| 'identity'
	| 'token'
	| 'csrf'
	| 'supply-chain'
	| 'ops'
	| 'severity'
	| 'branding'
	| 'terminal'
	| 'doctor';

export type DomainConcern = keyof DomainColors | keyof DomainChannels;

export type ConcernColorPath = `colors.${keyof DomainColors}` | `channels.${keyof DomainChannels}`;

/**
 * ast-grep-inspired rule row: stable id, tags, config path, linked error codes.
 */
export interface ConcernColorRule {
	id: string;
	tags: readonly ConcernTag[];
	concern: DomainConcern;
	colorPath: ConcernColorPath;
	description: string;
	errorCodes?: readonly string[];
}

export interface ResolvedConcernColor {
	id: string;
	concern: DomainConcern;
	tags: readonly ConcernTag[];
	colorPath: ConcernColorPath;
	base: string;
	bright: string;
	css: string;
	cssVar: string;
	errorCodes: readonly string[];
}

const SEVERITY_RULES: readonly ConcernColorRule[] = [
	{
		id: 'concern-color-fatal',
		tags: ['severity', 'branding', 'doctor', 'terminal'],
		concern: 'fatal',
		colorPath: 'colors.fatal',
		description: 'Fatal / error severity tint',
	},
	{
		id: 'concern-color-warn',
		tags: ['severity', 'branding', 'doctor', 'terminal'],
		concern: 'warn',
		colorPath: 'colors.warn',
		description: 'Warning severity tint',
	},
	{
		id: 'concern-color-info',
		tags: ['severity', 'branding', 'terminal'],
		concern: 'info',
		colorPath: 'colors.info',
		description: 'Informational tint',
	},
	{
		id: 'concern-color-success',
		tags: ['severity', 'branding', 'terminal'],
		concern: 'success',
		colorPath: 'colors.success',
		description: 'Success / pass tint',
	},
	{
		id: 'concern-color-primary',
		tags: ['branding', 'terminal'],
		concern: 'primary',
		colorPath: 'colors.primary',
		description: 'Primary brand color',
	},
	{
		id: 'concern-color-secondary',
		tags: ['branding', 'terminal'],
		concern: 'secondary',
		colorPath: 'colors.secondary',
		description: 'Secondary brand color',
	},
] as const;

const CHANNEL_RULES: readonly ConcernColorRule[] = ERROR_CODES.reduce<ConcernColorRule[]>(
	(acc, code) => {
		const channel = code.defaultChannel as keyof DomainChannels;
		const id = `concern-channel-${channel}`;
		const existing = acc.find(rule => rule.id === id);
		if (existing) {
			existing.errorCodes = [...(existing.errorCodes ?? []), code.code];
			return acc;
		}

		const tags: ConcernTag[] = ['security', 'terminal', 'doctor'];
		if (channel === 'vault') tags.push('vault');
		if (channel === 'identity') tags.push('identity');
		if (channel === 'token') tags.push('token');
		if (channel === 'csrf') tags.push('csrf');
		if (channel === 'supplyChain') tags.push('supply-chain');
		if (channel === 'ops') tags.push('ops');

		acc.push({
			id,
			tags,
			concern: channel,
			colorPath: `channels.${channel}`,
			description: code.description,
			errorCodes: [code.code],
		});
		return acc;
	},
	[],
);

/** Canonical concern → channel/color catalog (ast-grep rule list). */
export const CONCERN_COLOR_RULES: readonly ConcernColorRule[] = [
	...SEVERITY_RULES,
	...CHANNEL_RULES,
];

const RULE_BY_CONCERN = new Map(CONCERN_COLOR_RULES.map(rule => [rule.concern, rule]));
const RULE_BY_ERROR_CODE = new Map<string, ConcernColorRule>();
for (const rule of CONCERN_COLOR_RULES) {
	for (const code of rule.errorCodes ?? []) {
		RULE_BY_ERROR_CODE.set(code, rule);
	}
}

export function concernRulesByTag(tag: ConcernTag): ConcernColorRule[] {
	return CONCERN_COLOR_RULES.filter(rule => rule.tags.includes(tag));
}

export function getConcernColorRule(concern: DomainConcern): ConcernColorRule | undefined {
	return RULE_BY_CONCERN.get(concern);
}

export function getConcernColorRuleForCode(code: string): ConcernColorRule | undefined {
	return RULE_BY_ERROR_CODE.get(code) ?? ruleForErrorCode(getErrorCode(code));
}

function ruleForErrorCode(errorCode: ErrorCode | undefined): ConcernColorRule | undefined {
	if (!errorCode) return undefined;
	return RULE_BY_CONCERN.get(errorCode.defaultChannel as DomainConcern);
}

export function readColorPath(
	config: Pick<DomainConfig, 'colors' | 'channels'>,
	colorPath: ConcernColorPath,
): string | null {
	const [group, key] = colorPath.split('.') as ['colors' | 'channels', string];
	const value =
		group === 'colors'
			? config.colors[key as keyof DomainColors]
			: config.channels[key as keyof DomainChannels];
	return value ? (normalizeHex(value) ?? value) : null;
}

export function resolveConcernColors(
	config: Pick<DomainConfig, 'colors' | 'channels'>,
): ResolvedConcernColor[] {
	const resolved: ResolvedConcernColor[] = [];

	for (const rule of CONCERN_COLOR_RULES) {
		const base = readColorPath(config, rule.colorPath);
		if (!base) continue;
		const bright = brightenColor(base) ?? base;
		const css = toCss(base) ?? base;
		resolved.push({
			id: rule.id,
			concern: rule.concern,
			tags: rule.tags,
			colorPath: rule.colorPath,
			base,
			bright,
			css,
			cssVar: `--domain-${rule.colorPath.replace('.', '-')}`,
			errorCodes: rule.errorCodes ?? [],
		});
	}

	return resolved;
}

function severityConcern(
	severity: string,
	issueSeverity: DoctorIssue['severity'],
): keyof DomainColors {
	if (severity === 'info') return 'info';
	if (severity === 'success') return 'success';
	if (severity === 'warn' || severity === 'warning') return 'warn';
	if (issueSeverity === 'warning') return 'warn';
	return 'fatal';
}

export function resolveIssueColor(
	config: Pick<DomainConfig, 'colors' | 'channels' | 'errorOverrides'>,
	issue: Pick<DoctorIssue, 'severity' | 'code'>,
	variant: 'base' | 'bright' = 'base',
): string {
	const override = issue.code ? config.errorOverrides[issue.code] : undefined;
	const channel =
		override?.channel ?? (issue.code ? getErrorCode(issue.code)?.defaultChannel : undefined);

	if (channel) {
		const rule = getConcernColorRule(channel as DomainConcern);
		const path = rule?.colorPath ?? (`channels.${channel}` as ConcernColorPath);
		const base = readColorPath(config, path);
		if (base) {
			return variant === 'bright' ? (brightenColor(base) ?? base) : base;
		}
	}

	const concern = severityConcern(override?.severity ?? '', issue.severity);
	const severityRule = getConcernColorRule(concern);
	const path = severityRule?.colorPath ?? (`colors.${concern}` as ConcernColorPath);
	const base = readColorPath(config, path);
	return base ?? (issue.severity === 'error' ? '#FF453A' : '#FF9500');
}

export function colorizeConcern(
	config: Pick<DomainConfig, 'colors' | 'channels' | 'errorOverrides'>,
	issue: Pick<DoctorIssue, 'severity' | 'code' | 'message'>,
	label: string,
): string {
	const color = resolveIssueColor(config, issue, 'bright');
	return colorize(color, `${label} ${issue.message}`);
}

export function formatConcernColorTable(config: Pick<DomainConfig, 'colors' | 'channels'>): string {
	const rows = resolveConcernColors(config);
	const lines = [
		'id | concern | tags | base | bright | path',
		...rows.map(row => {
			const tags = row.tags.join(',');
			return `${row.id} | ${row.concern} | ${tags} | ${row.base} | ${row.bright} | ${row.colorPath}`;
		}),
	];
	return lines.join('\n');
}

export function concernColorCssBlock(config: Pick<DomainConfig, 'colors' | 'channels'>): string {
	return resolveConcernColors(config)
		.map(
			row => `${row.cssVar}: ${row.css}; ${row.cssVar}-bright: ${toCss(row.bright) ?? row.bright};`,
		)
		.join('\n');
}
