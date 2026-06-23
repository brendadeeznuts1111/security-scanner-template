import type {ReportData} from './types.ts';

const TEMPLATE_PATH = new URL('./template.html', import.meta.url).pathname;

/**
 * Generate a self-contained HTML security dashboard.
 */
export async function generateHtmlReport(data: ReportData): Promise<string> {
	const template = await Bun.file(TEMPLATE_PATH).text();
	const payload = JSON.stringify(data);
	return template.replace('{{DATA}}', payload);
}
