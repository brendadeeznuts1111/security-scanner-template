import {FEATURE_REPORT_HTML, FEATURE_REPORT_MARKDOWN} from '../features/index.ts';
import {enrichReportData, generateEnrichedReport, type GenerateReportOptions} from './enrich.ts';
import {generateHtmlReport} from './html.ts';
import {generateJsonReport} from './json.ts';
import {generateMarkdownReport} from './markdown.ts';
import type {ReportData, ReportFormat, ReportOptions} from './types.ts';

export type {
	ReportAdvisory,
	ReportData,
	ReportFormat,
	ReportOptions,
	ReportOverride,
} from './types.ts';
export {
	enrichReportData,
	generateEnrichedReport,
	sanitizeOperatorQrForExport,
	type GenerateReportOptions,
} from './enrich.ts';
export {generateHtmlReport, generateJsonReport, generateMarkdownReport};
export {previewHtmlReport, type ReportPreviewOptions, type ReportPreviewResult} from './preview.ts';

export async function generateReport(
	data: ReportData,
	format: ReportFormat,
	options: GenerateReportOptions = {},
): Promise<string> {
	if (format === 'markdown' && !FEATURE_REPORT_MARKDOWN) {
		throw new Error(
			'Markdown report format is not included in this build (FEATURE_REPORT_MARKDOWN=false)',
		);
	}
	if (format === 'html' && !FEATURE_REPORT_HTML) {
		throw new Error(
			'HTML report format is not included in this build (FEATURE_REPORT_HTML=false)',
		);
	}

	return generateEnrichedReport(data, format, options);
}

export function computeRiskScore(fatal: number, warn: number, info: number): number {
	if (fatal === 0 && warn === 0 && info === 0) return 0;
	const weighted = fatal * 10 + warn * 3 + info;
	return Math.min(100, weighted * 5);
}
