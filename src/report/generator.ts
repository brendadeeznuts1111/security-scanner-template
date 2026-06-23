export {generateMarkdownReport} from './markdown.ts';
export {generateHtmlReport} from './html.ts';
export {escapeHtml, safeJsonScript, renderAdvisoryRows, renderOverrideRows} from './safe.ts';
export {isWebViewAvailable, screenshotHtml, type ScreenshotOptions, type ScreenshotResult} from './webview.ts';
export {buildOperatorQrForDomain} from './operator-qr.ts';
export {renderOperatorQr, renderVisualGallery, resolveReportVisuals} from './visuals.ts';
export type {
	ReportData,
	ReportAdvisory,
	ReportOperatorQr,
	ReportOverride,
	ReportVisual,
} from './types.ts';

import type {DomainRegistry} from '../config/registry.ts';
import {generateMarkdownReport} from './markdown.ts';
import {generateHtmlReport} from './html.ts';
import {buildOperatorQrForDomain, type BuildOperatorQrOptions} from './operator-qr.ts';
import {escapeHtml} from './safe.ts';
import {isWebViewAvailable, screenshotHtml} from './webview.ts';
import type {ScreenshotOptions} from './webview.ts';
import type {AuditEntry} from '../audit/types.ts';
import type {ReportData, ReportVisual} from './types.ts';

/**
 * Stateless report generator for Markdown, HTML, and WebView screenshot output.
 */
export class ReportGenerator {
	markdown(data: ReportData) {
		return generateMarkdownReport(data);
	}

	async html(data: ReportData, options: import('./enrich.ts').GenerateReportOptions = {}) {
		const {generateEnrichedReport} = await import('./enrich.ts');
		return generateEnrichedReport(data, 'html', options);
	}

	safeHtml(text: string) {
		return escapeHtml(text);
	}

	/**
	 * Capture a screenshot of the rendered HTML report.
	 * Returns null when Bun.WebView is unavailable.
	 */
	async screenshot(data: ReportData, options: Omit<ScreenshotOptions, 'html' | 'filePath'> = {}): Promise<import('./webview.ts').ScreenshotResult | null> {
		if (!isWebViewAvailable()) {
			return null;
		}
		const html = await this.html(data);
		return screenshotHtml({...options, html});
	}

	/**
	 * Map audit entries with visual artifacts into report gallery items.
	 */
	visualsFromAudit(entries: AuditEntry[]): ReportVisual[] {
		return entries
			.filter(entry => entry.visual)
			.map(entry => ({
				id: entry.id,
				label: entry.package,
				imagePath: entry.visual?.imagePath ?? entry.visual?.normalizedPath,
				normalizedPath: entry.visual?.normalizedPath,
				thumbnailPath: entry.visual?.thumbnailPath,
				placeholderDataUrl: entry.visual?.placeholderDataUrl,
			}));
	}

	/**
	 * Generate HTML including lazy-loaded placeholders from audit visuals.
	 */
	async htmlFromAudit(data: ReportData, auditEntries: AuditEntry[]): Promise<string> {
		return generateHtmlReport({
			...data,
			visuals: this.visualsFromAudit(auditEntries),
		});
	}

	/**
	 * Attach a domain operator QR (vault master token) and render HTML.
	 */
	async htmlWithOperatorQr(
		data: ReportData,
		domain: string,
		registry: DomainRegistry,
		options: BuildOperatorQrOptions = {},
	): Promise<string> {
		const operatorQr = await buildOperatorQrForDomain(registry, domain, options);
		return generateHtmlReport({
			...data,
			project: data.project ?? domain,
			operatorQr: operatorQr ?? undefined,
		});
	}

	/**
	 * Audit visuals plus operator QR in one HTML report.
	 */
	async htmlFromAuditWithOperatorQr(
		data: ReportData,
		auditEntries: AuditEntry[],
		domain: string,
		registry: DomainRegistry,
		options: BuildOperatorQrOptions = {},
	): Promise<string> {
		const operatorQr = await buildOperatorQrForDomain(registry, domain, options);
		return generateHtmlReport({
			...data,
			project: data.project ?? domain,
			visuals: this.visualsFromAudit(auditEntries),
			operatorQr: operatorQr ?? undefined,
		});
	}
}
