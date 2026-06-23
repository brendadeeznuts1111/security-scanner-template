import {mkdtemp, rm} from 'fs/promises';
import path from 'path';
import os from 'node:os';

export interface ScreenshotOptions {
	/** HTML content to render. Either this or `filePath` must be provided. */
	html?: string;
	/** Path to an existing HTML file to render. */
	filePath?: string;
	/** Output path for the screenshot. If omitted, a temp path is used. */
	outputPath?: string;
	/** Viewport width in CSS pixels. */
	width?: number;
	/** Viewport height in CSS pixels. */
	height?: number;
	/** Image format. */
	format?: 'png' | 'jpeg';
	/** JPEG quality (0-100). Ignored for PNG. */
	quality?: number;
}

export interface ScreenshotResult {
	/** Path to the saved screenshot. */
	path: string;
	/** Raw image bytes. */
	bytes: Uint8Array;
	/** Viewport width used. */
	width: number;
	/** Viewport height used. */
	height: number;
}

/**
 * Check whether Bun.WebView is available in this runtime.
 */
export function isWebViewAvailable(): boolean {
	return typeof Bun !== 'undefined' && 'WebView' in Bun;
}

/**
 * Render HTML in a headless Bun.WebView and capture a screenshot.
 *
 * Uses ephemeral storage and a temporary file for the HTML payload so large
 * reports do not blow up the data URL length limit.
 */
export async function screenshotHtml(options: ScreenshotOptions): Promise<ScreenshotResult> {
	if (!isWebViewAvailable()) {
		throw new Error('Bun.WebView is not available in this runtime');
	}

	const width = options.width ?? 1280;
	const height = options.height ?? 720;
	const format = options.format ?? 'png';

	let sourceUrl: string;
	let cleanupHtml: (() => Promise<void>) | undefined;

	if (options.filePath) {
		sourceUrl = `file://${path.resolve(options.filePath)}`;
	} else if (options.html) {
		const tempDir = await mkdtemp(path.join(os.tmpdir(), 'bun-report-'));
		const htmlPath = path.join(tempDir, 'report.html');
		await Bun.write(htmlPath, options.html);
		sourceUrl = `file://${htmlPath}`;
		cleanupHtml = async () => {
			await rm(tempDir, {recursive: true, force: true});
		};
	} else {
		throw new Error('Either html or filePath must be provided');
	}

	let outputPath: string;
	let cleanupOutput: (() => Promise<void>) | undefined;

	if (options.outputPath) {
		outputPath = path.resolve(options.outputPath);
	} else {
		const tempDir = await mkdtemp(path.join(os.tmpdir(), 'bun-screenshot-'));
		outputPath = path.join(tempDir, `report.${format}`);
		cleanupOutput = async () => {
			await rm(tempDir, {recursive: true, force: true});
		};
	}

	const view = new Bun.WebView({
		width,
		height,
		dataStore: 'ephemeral',
	});

	try {
		await view.navigate(sourceUrl);
		const screenshot = await view.screenshot({
			format,
			quality: options.quality,
			encoding: 'buffer',
		});
		await Bun.write(outputPath, screenshot);

		const bytes = new Uint8Array(screenshot);
		return {path: outputPath, bytes, width, height};
	} finally {
		view.close();
		await cleanupHtml?.();
		await cleanupOutput?.();
	}
}
