import {loadImage} from './load.ts';
import {
	isWebViewAvailable,
	screenshotHtml,
	type ScreenshotOptions,
	type ScreenshotResult,
} from '../report/webview.ts';

export interface ReportImageOptions extends ScreenshotOptions {}

export interface ReportImageResult extends ScreenshotResult {
	image: Bun.Image;
}

/**
 * Capture HTML security reports as images via Bun.WebView screenshots.
 */
export class ReportImageRenderer {
	static isAvailable(): boolean {
		return isWebViewAvailable();
	}

	/**
	 * Render report HTML to an image file and return both bytes and a Bun.Image handle.
	 */
	static async render(
		reportHtml: string,
		options: ReportImageOptions = {},
	): Promise<ReportImageResult> {
		const screenshot = await screenshotHtml({
			html: reportHtml,
			width: options.width ?? 1024,
			height: options.height ?? 768,
			outputPath: options.outputPath,
			format: options.format,
			quality: options.quality,
		});

		const image = await loadImage(screenshot.bytes);
		return {...screenshot, image};
	}
}
