import {generateEnrichedReport} from './enrich.ts';
import type {ReportData} from './types.ts';

export interface ReportPreviewOptions {
	width?: number;
	height?: number;
	/** Capture a screenshot after the report renders. */
	screenshotPath?: string;
}

export interface ReportPreviewResult {
	url: string;
	title: string;
	screenshotPath?: string;
}

/**
 * Open a security report in a headless Bun.WebView for local preview.
 */
export async function previewHtmlReport(
	data: ReportData,
	options: ReportPreviewOptions = {},
): Promise<ReportPreviewResult> {
	const html = await generateEnrichedReport(data, 'html');
	const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

	await using view = new Bun.WebView({
		width: options.width ?? 1280,
		height: options.height ?? 720,
	});

	await view.navigate(dataUrl);
	const title = await view.evaluate('document.title');

	let screenshotPath: string | undefined;
	if (options.screenshotPath) {
		const screenshot = await view.screenshot();
		await Bun.write(options.screenshotPath, screenshot);
		screenshotPath = options.screenshotPath;
	}

	return {
		url: dataUrl.slice(0, 120),
		title: typeof title === 'string' ? title : 'Security Report',
		screenshotPath,
	};
}