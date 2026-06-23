import type {ReportData} from './types.ts';

/**
 * Generate a JSON security report.
 */
export function generateJsonReport(data: ReportData): string {
	return JSON.stringify(data, null, 2);
}
