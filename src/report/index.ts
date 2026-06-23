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
export {generateHtmlReport, generateJsonReport, generateMarkdownReport};

/**
 * Generate a report in the requested format.
 */
export async function generateReport(data: ReportData, format: ReportFormat): Promise<string> {
	switch (format) {
		case 'json':
			return generateJsonReport(data);
		case 'markdown':
			return generateMarkdownReport(data);
		case 'html':
			return generateHtmlReport(data);
		default:
			throw new Error(`Unsupported report format: ${format}`);
	}
}

/**
 * Compute a simple risk score from advisory counts.
 * 100 is worst; 0 is clean.
 */
export function computeRiskScore(fatal: number, warn: number, info: number): number {
	if (fatal === 0 && warn === 0 && info === 0) return 0;
	const weighted = fatal * 10 + warn * 3 + info;
	return Math.min(100, weighted * 5);
}
