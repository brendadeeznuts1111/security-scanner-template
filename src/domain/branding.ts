import type {DomainChannels, DomainColors, DomainConfig} from '../config/types.ts';
import {ansiCode, brightenColor, colorize, normalizeHex, toCss} from '../color/index.ts';
import {
	formatConcernColorTable,
	resolveConcernColors,
	type ResolvedConcernColor,
} from './concern-colors.ts';
import {resolveSecretsService} from './secrets-service.ts';

/** Reverse-DNS domain identifier pattern (matches config doctor). */
export const REVERSE_DNS_PATTERN = /^[a-zA-Z0-9][-a-zA-Z0-9.]*$/;

export function isReverseDnsDomain(domain: string): boolean {
	return REVERSE_DNS_PATTERN.test(domain);
}

/** Filesystem-safe segment from a reverse-DNS domain id. */
export function reverseDnsPathSegment(domain: string): string {
	return domain.replace(/[^a-zA-Z0-9.-]+/g, '_');
}

export interface ColorSwatch {
	name: string;
	hex: string;
	css: string;
	bright?: string;
	tags?: string[];
}

/**
 * Human-facing service label — displayName when set, otherwise reverse-DNS domain.
 */
export function domainDisplayName(config: DomainConfig): string {
	return config.displayName?.trim() || config.domain;
}

export {resolveSecretsService, resolveSecretsService as domainServiceName};

/** Unified branding + runtime presentation profile for a domain. */
export interface DomainBrandingProfile {
	displayName: string;
	domain: string;
	description?: string;
	service: string;
	colors: DomainColors;
	channels: DomainChannels;
	qr: {
		enabled: boolean;
		dark: string;
		light: string;
	};
	operatorQr: {
		enabled: boolean;
		size: number;
		dark?: string;
		light?: string;
	};
	report: {
		format: string;
		output: string;
	};
	runtime: {
		interactive: boolean;
		http3: boolean;
		http1: boolean;
		port?: number;
		hostname?: string;
	};
}

/**
 * Collect every branding-, report-, and service-facing field from a domain config.
 */
export function domainBrandingProfile(config: DomainConfig): DomainBrandingProfile {
	const operatorQr = config.ops.report.operatorQr;
	return {
		displayName: domainDisplayName(config),
		domain: config.domain,
		description: config.description?.trim() || undefined,
		service: resolveSecretsService(config),
		colors: config.colors,
		channels: config.channels,
		qr: {
			enabled: config.visual?.qr?.enabled !== false,
			...domainQrColors(config),
		},
		operatorQr: {
			enabled: operatorQr?.enabled !== false,
			size: operatorQr?.size ?? 180,
			dark: operatorQr?.dark,
			light: operatorQr?.light,
		},
		report: {
			format: config.ops.report.format,
			output: config.ops.report.output,
		},
		runtime: {
			interactive: config.service?.interactive === true,
			http3: config.service?.http3 === true,
			http1: config.service?.http1 !== false,
			port: config.service?.port,
			hostname: config.service?.hostname,
		},
	};
}

/**
 * REPL prompt label: `sp:Example Service>`.
 */
export function domainPromptLabel(config: DomainConfig): string {
	return `sp:${domainDisplayName(config)}> `;
}

/**
 * Colorize text with a domain palette entry via Bun.color ANSI codes.
 */
export function colorizeDomain(
	config: DomainConfig,
	key: keyof DomainColors | keyof DomainChannels,
	text: string,
): string {
	const channels = config.channels as unknown as Record<string, string>;
	const colors = config.colors as unknown as Record<string, string>;
	const color = channels[key] ?? colors[key];
	if (!color) return text;
	return colorize(color, text);
}

/**
 * List normalized domain colors for terminal swatch rendering.
 */
export function domainColorSwatches(config: DomainConfig): ColorSwatch[] {
	const byConcern = new Map(resolveConcernColors(config).map(row => [row.concern, row]));
	const entries: [string, string][] = [
		...(Object.entries(config.colors) as [string, string][]),
		...Object.entries(config.channels).map(
			([name, value]) => [`channel:${name}`, value] as [string, string],
		),
	];

	const swatches: ColorSwatch[] = [];
	for (const [name, value] of entries) {
		const hex = normalizeHex(value);
		const css = toCss(value);
		if (hex && css) {
			const concernKey = name.startsWith('channel:') ? name.slice('channel:'.length) : name;
			const mapped = byConcern.get(concernKey as ResolvedConcernColor['concern']);
			swatches.push({
				name,
				hex,
				css,
				bright: mapped?.bright ?? brightenColor(hex) ?? undefined,
				tags: mapped?.tags ? [...mapped.tags] : undefined,
			});
		}
	}
	return swatches;
}

export {formatConcernColorTable, resolveConcernColors};
export type {ResolvedConcernColor};

/**
 * Render a one-line ANSI color swatch for the REPL.
 */
export function formatColorSwatch(swatch: ColorSwatch): string {
	const block = ansiCode(swatch.hex, 'ansi-256') + '██' + '\x1b[0m';
	const brightBlock = swatch.bright ? ansiCode(swatch.bright, 'ansi-256') + '██' + '\x1b[0m' : '';
	const tags = swatch.tags?.length ? ` [${swatch.tags.join(',')}]` : '';
	const bright = swatch.bright
		? ` bright=${swatch.bright}${brightBlock ? ` ${brightBlock}` : ''}`
		: '';
	return `${block} ${swatch.name}: ${swatch.hex}${bright}${tags}`;
}

/**
 * Default QR module/background colors from the domain palette.
 */
export function domainQrColors(config: DomainConfig): {dark: string; light: string} {
	const channels = config.channels as unknown as Record<string, string>;
	return {
		dark: channels.token ?? config.colors.primary,
		light: '#FFFFFF',
	};
}

/**
 * Startup banner lines for the interactive shell.
 */
export function domainBannerLines(config: DomainConfig): string[] {
	const lines = [
		domainDisplayName(config),
		config.domain,
		`service: ${resolveSecretsService(config)}`,
	];
	if (config.description) {
		lines.push(config.description);
	}
	return lines;
}
