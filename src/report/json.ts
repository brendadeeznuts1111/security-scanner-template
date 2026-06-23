import {sanitizeOperatorQrForExport} from './enrich.ts';
import type {ReportData} from './types.ts';

/**
 * Generate a JSON security report.
 */
export function generateJsonReport(data: ReportData): string {
	const exportData: ReportData = {
		...data,
		operatorQr: data.operatorQr
			? {
					...sanitizeOperatorQrForExport(data.operatorQr)!,
					dataUrl: '',
				}
			: undefined,
	};
	return JSON.stringify(exportData, null, 2);
}
