import path from 'path';
import {mkdir} from 'fs/promises';
import {isWebViewAvailable} from '../report/webview.ts';
import {isImageAvailable} from '../visual/load.ts';
import type {ImageInspection} from '../visual/metadata.ts';
import {ImagePipeline} from '../visual/pipeline.ts';
import {PlaceholderGenerator} from '../visual/placeholder.ts';
import {ThumbnailGenerator, thumbnailPathFor} from '../visual/thumb.ts';
import {scanHtmlResponse, type HtmlFinding} from './html.ts';

export type WebSecurityFindingType =
	| 'csp-missing'
	| 'csp-weak'
	| 'xss-inline-handler'
	| 'xss-dangerous-html'
	| 'header-missing';

export interface WebSecurityFinding {
	type: WebSecurityFindingType;
	severity: 'fatal' | 'warn' | 'info';
	description: string;
	value?: string;
}

export interface WebSecurityScreenshot {
	fullBytes: Uint8Array;
	thumbnailBytes?: Uint8Array;
	placeholderDataUrl?: string;
	fullPath?: string;
	thumbnailPath?: string;
	/** WebP storage path with EXIF stripped. */
	normalizedPath?: string;
	normalizedBytes?: Uint8Array;
	inspection?: ImageInspection;
}

export interface WebSecurityScanResult {
	findings: WebSecurityFinding[];
	screenshot?: WebSecurityScreenshot;
}

export interface WebSecurityScanOptions {
	/** Scan rendered DOM via Bun.WebView when available. */
	rendered?: boolean;
	width?: number;
	height?: number;
	/** Capture a PNG screenshot when rendering (default: true when rendered). */
	captureScreenshot?: boolean;
	/** Persist screenshot + thumbnail sidecar under this directory. */
	screenshotDir?: string;
	/** Filename stem when writing screenshotDir artifacts. */
	screenshotId?: string;
}

const WEAK_CSP_PATTERNS = [/unsafe-inline/i, /unsafe-eval/i, /\*/];

function parseCspHeader(headers: Record<string, string | undefined>): string | undefined {
	return (
		headers['content-security-policy'] ??
		headers['Content-Security-Policy'] ??
		headers['content-security-policy-report-only']
	);
}

function scanCspHeaders(headers: Record<string, string | undefined>): WebSecurityFinding[] {
	const findings: WebSecurityFinding[] = [];
	const csp = parseCspHeader(headers);

	if (!csp) {
		findings.push({
			type: 'csp-missing',
			severity: 'warn',
			description: 'Content-Security-Policy header is missing',
		});
		return findings;
	}

	for (const pattern of WEAK_CSP_PATTERNS) {
		if (pattern.test(csp)) {
			findings.push({
				type: 'csp-weak',
				severity: 'warn',
				description: 'CSP contains a weak directive',
				value: csp.slice(0, 200),
			});
			break;
		}
	}

	return findings;
}

function htmlFindingsToWebSecurity(findings: HtmlFinding[]): WebSecurityFinding[] {
	return findings.map(finding => ({
		type:
			finding.type === 'inline-script' || finding.type === 'script'
				? 'xss-dangerous-html'
				: 'xss-dangerous-html',
		severity: finding.severity,
		description: finding.description,
		value: finding.value,
	}));
}

/**
 * Build thumbnail + placeholder artifacts from raw screenshot bytes.
 */
export async function processWebScreenshot(
	bytes: Uint8Array,
	options: {screenshotDir?: string; screenshotId?: string} = {},
): Promise<WebSecurityScreenshot> {
	const artifact: WebSecurityScreenshot = {fullBytes: bytes};

	if (isImageAvailable()) {
		try {
			const id = options.screenshotId ?? crypto.randomUUID();
			const normalizedDest = options.screenshotDir
				? path.join(options.screenshotDir, `${id}.webp`)
				: undefined;

			const pipeline = await ImagePipeline.process(bytes, {
				inspect: true,
				stripExif: true,
				convertWebp: true,
				dest: normalizedDest,
			});

			artifact.inspection = pipeline.inspection;
			artifact.normalizedBytes = pipeline.bytes;
			artifact.normalizedPath = pipeline.normalizedPath;
			artifact.placeholderDataUrl = await PlaceholderGenerator.generate(pipeline.bytes);

			const {image} = await ThumbnailGenerator.generate(pipeline.bytes, 200, 200, 'webp', 80);
			artifact.thumbnailBytes = await image.bytes();
		} catch {
			// Keep raw screenshot bytes even when image post-processing fails.
		}
	}

	if (options.screenshotDir) {
		const id = options.screenshotId ?? crypto.randomUUID();
		await mkdir(options.screenshotDir, {recursive: true});

		if (artifact.normalizedPath) {
			artifact.fullPath = artifact.normalizedPath;
		} else {
			const fullPath = path.join(options.screenshotDir, `${id}.png`);
			await Bun.write(fullPath, bytes);
			artifact.fullPath = fullPath;
		}

		if (artifact.thumbnailBytes) {
			const thumbStem = artifact.fullPath ?? path.join(options.screenshotDir, `${id}.png`);
			const thumbPath = thumbnailPathFor(thumbStem);
			await Bun.write(thumbPath, artifact.thumbnailBytes);
			artifact.thumbnailPath = thumbPath;
		}
	}

	return artifact;
}

async function scanRenderedDom(
	html: string,
	options: WebSecurityScanOptions,
): Promise<{findings: WebSecurityFinding[]; screenshot?: WebSecurityScreenshot}> {
	if (!options.rendered || !isWebViewAvailable()) {
		return {findings: []};
	}

	const findings: WebSecurityFinding[] = [];
	const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
	const captureScreenshot = options.captureScreenshot ?? true;

	await using view = new Bun.WebView({
		width: options.width ?? 1280,
		height: options.height ?? 720,
	});

	await view.navigate(dataUrl);

	const inlineHandlers = await view.evaluate(`
		Array.from(document.querySelectorAll('[onclick],[onerror],[onload]'))
			.map(el => el.outerHTML.slice(0, 120))
	`);

	if (Array.isArray(inlineHandlers) && inlineHandlers.length > 0) {
		for (const handler of inlineHandlers) {
			if (typeof handler !== 'string') continue;
			findings.push({
				type: 'xss-inline-handler',
				severity: 'fatal',
				description: 'Rendered page contains inline event handler',
				value: handler,
			});
		}
	}

	const cookieAccess = await view.evaluate(`
		(() => {
			try {
				return typeof document.cookie === 'string';
			} catch {
				return false;
			}
		})()
	`);

	if (cookieAccess === true) {
		const scripts = await view.evaluate(`document.scripts.length`);
		if (typeof scripts === 'number' && scripts > 0) {
			findings.push({
				type: 'xss-dangerous-html',
				severity: 'info',
				description: 'Rendered page exposes document.cookie to scripts',
			});
		}
	}

	let screenshot: WebSecurityScreenshot | undefined;
	if (captureScreenshot) {
		const screenshotBytes = await view.screenshot({
			format: 'png',
			encoding: 'buffer',
		});
		screenshot = await processWebScreenshot(screenshotBytes, {
			screenshotDir: options.screenshotDir,
			screenshotId: options.screenshotId,
		});
	}

	return {findings, screenshot};
}

/**
 * Scan HTML and optional response headers for CSP gaps and XSS surfaces.
 *
 * Combines HTMLRewriter static analysis with optional Bun.WebView rendered checks.
 * When `rendered` is enabled, captures a screenshot and auto-generates thumbnail +
 * placeholder artifacts when Bun.Image is available.
 */
export async function scanWebSecurity(
	html: string,
	headers: Record<string, string | undefined> = {},
	options: WebSecurityScanOptions = {},
): Promise<WebSecurityScanResult> {
	const rendered = await scanRenderedDom(html, options);
	const findings: WebSecurityFinding[] = [
		...scanCspHeaders(headers),
		...htmlFindingsToWebSecurity(await scanHtmlResponse(html)),
		...rendered.findings,
	];

	const seen = new Set<string>();
	const deduped = findings.filter(finding => {
		const key = `${finding.type}:${finding.value ?? finding.description}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	return {
		findings: deduped,
		screenshot: rendered.screenshot,
	};
}