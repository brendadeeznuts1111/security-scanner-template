import type {DomainRegistry} from '../config/registry.ts';
import {loadDomainReportContext, type DomainReportContext} from '../config/resolve-domain.ts';
import type {DomainColors, DomainConfig} from '../config/types.ts';
import {buildOperatorQrForDomain} from './operator-qr.ts';
import {generateHtmlReport} from './html.ts';
import {generateJsonReport} from './json.ts';
import {generateMarkdownReport} from './markdown.ts';
import type {ReportData, ReportFormat, ReportOperatorQr} from './types.ts';

export interface GenerateReportOptions {
	/** Reverse-DNS domain for operator QR + branding. */
	domain?: string;
	registry?: DomainRegistry;
	colors?: DomainColors;
	/** When false, skip operator QR enrichment entirely. */
	operatorQr?: boolean;
	root?: string;
}

function operatorQrEnabled(config: DomainConfig): boolean {
	if (config.visual?.qr?.enabled === false) {
		return false;
	}
	return config.ops.report.operatorQr?.enabled !== false;
}

function operatorQrOptions(config: DomainConfig, root?: string) {
	const qr = config.ops.report.operatorQr;
	return {
		size: qr?.size,
		dark: qr?.dark,
		light: qr?.light,
		root,
	};
}

function registryForContext(ctx: DomainReportContext, registry?: DomainRegistry): DomainRegistry {
	if (registry) {
		return registry;
	}

	return {
		root: process.cwd(),
		async loadAll() {},
		async ensureDomain() {},
		get(domain: string) {
			if (domain !== ctx.domain) {
				throw new Error(`Unknown domain: ${domain}`);
			}
			return ctx.config;
		},
		has(domain: string) {
			return domain === ctx.domain;
		},
		list() {
			return [ctx.domain];
		},
		async security() {
			throw new Error('not used');
		},
		async service() {
			throw new Error('not used');
		},
		watch() {},
		unwatch() {},
		async checkPackageVersions() {
			return [];
		},
		async scanPatterns() {
			return [];
		},
		async loadThreatFeed() {},
		checkPackageThreats() {
			return [];
		},
		checkPackagesThreats() {
			return new Map();
		},
		getLoadedThreats() {
			return [];
		},
		async reloadDomain() {
			return null;
		},
	};
}

/**
 * Remove token-bearing QR payload from exported JSON/Markdown metadata.
 */
export function sanitizeOperatorQrForExport(
	operatorQr?: ReportOperatorQr,
): Omit<ReportOperatorQr, 'dataUrl'> | undefined {
	if (!operatorQr) {
		return undefined;
	}

	const {dataUrl: _dataUrl, ...meta} = operatorQr;
	return meta;
}

/**
 * Attach domain branding and optional operator QR to report data.
 */
export async function enrichReportData(
	data: ReportData,
	options: GenerateReportOptions = {},
): Promise<ReportData> {
	const root = options.root ?? process.cwd();
	const ctx =
		options.registry && options.domain
			? {
					domain: options.domain,
					config: options.registry.get(options.domain),
					path: '',
				}
			: await loadDomainReportContext(root, options.domain);

	if (!ctx) {
		return data;
	}

	const project = data.project ?? ctx.config.displayName ?? ctx.domain;
	let operatorQr = data.operatorQr;

	const includeQr = options.operatorQr !== false && operatorQrEnabled(ctx.config);
	if (includeQr && !operatorQr) {
		const registry = registryForContext(ctx, options.registry);
		await registry.loadAll();
		const built = await buildOperatorQrForDomain(registry, ctx.domain, {
			...operatorQrOptions(ctx.config, root),
		});
		operatorQr = built ?? undefined;
	}

	return {
		...data,
		project,
		operatorQr,
	};
}

/**
 * Generate any report format with domain enrichment (operator QR on HTML by default).
 */
export async function generateEnrichedReport(
	data: ReportData,
	format: ReportFormat,
	options: GenerateReportOptions = {},
): Promise<string> {
	const enriched = await enrichReportData(data, options);
	const colors =
		options.colors ?? (await loadDomainReportContext(options.root, options.domain))?.config.colors;

	switch (format) {
		case 'json':
			return generateJsonReport(enriched);
		case 'markdown':
			return generateMarkdownReport(enriched);
		case 'html':
			return generateHtmlReport(enriched, colors);
		default:
			throw new Error(`Unsupported report format: ${format}`);
	}
}
