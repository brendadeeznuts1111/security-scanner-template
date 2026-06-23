import {parseArgs} from 'util';
import path from 'path';
import {colorize, TERMINAL} from '../color/index.ts';
import {previewHtmlReport} from '../report/preview.ts';
import {isWebViewAvailable, screenshotHtml} from '../report/webview.ts';
import {scanWebSecurity} from '../scan/web-security.ts';
import type {ReportData} from '../report/types.ts';
import {runCliIfMain} from '../utils/cli.ts';

const EMPTY_REPORT: ReportData = {
	generatedAt: new Date().toISOString(),
	feedSource: 'cli',
	riskScore: 0,
	fatalCount: 0,
	warnCount: 0,
	infoCount: 0,
	advisories: [],
	overrides: [],
	dryRun: false,
};

async function runPreview(output?: string): Promise<void> {
	if (!isWebViewAvailable()) {
		console.error(colorize(TERMINAL.scannerFatal, '[report] Bun.WebView is not available'));
		process.exit(1);
	}

	const result = await previewHtmlReport(EMPTY_REPORT, {
		screenshotPath: output,
	});

	console.error(colorize(TERMINAL.scannerOk, `[report] preview: ${result.title}`));
	if (result.screenshotPath) {
		console.error(colorize(TERMINAL.scannerInfo, `[report] screenshot: ${result.screenshotPath}`));
	}
}

async function runScreenshot(htmlPath: string, output?: string): Promise<void> {
	const file = Bun.file(htmlPath);
	if (!(await file.exists())) {
		console.error(colorize(TERMINAL.scannerFatal, `[report] file not found: ${htmlPath}`));
		process.exit(1);
	}

	const result = await screenshotHtml({
		filePath: htmlPath,
		outputPath: output,
	});

	console.error(colorize(TERMINAL.scannerOk, `[report] screenshot: ${result.path}`));
}

async function runSecurityScan(target: string, rendered: boolean, json: boolean): Promise<void> {
	const file = Bun.file(target);
	if (!(await file.exists())) {
		console.error(colorize(TERMINAL.scannerFatal, `[report] file not found: ${target}`));
		process.exit(1);
	}

	const html = await file.text();
	const result = await scanWebSecurity(html, {}, {rendered});
	const {findings, screenshot} = result;

	if (json) {
		console.log(JSON.stringify(result, null, 2));
		process.exit(findings.some(f => f.severity === 'fatal') ? 1 : 0);
	}

	console.error(
		colorize(TERMINAL.scannerInfo, `[report] ${findings.length} web security finding(s)`),
	);
	if (screenshot?.thumbnailPath) {
		console.error(
			colorize(TERMINAL.scannerDim, `[report] screenshot thumbnail: ${screenshot.thumbnailPath}`),
		);
	}
	for (const finding of findings) {
		const color = finding.severity === 'fatal' ? TERMINAL.scannerFatal : TERMINAL.scannerWarn;
		console.error(colorize(color, `  ${finding.severity} ${finding.type}: ${finding.description}`));
		if (finding.value) {
			console.error(colorize(TERMINAL.scannerDim, `    ${finding.value}`));
		}
	}

	process.exit(findings.some(f => f.severity === 'fatal') ? 1 : 0);
}

async function main(): Promise<void> {
	const {values, positionals} = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			output: {type: 'string'},
			rendered: {type: 'boolean'},
			json: {type: 'boolean'},
			help: {type: 'boolean', short: 'h'},
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(`Usage:
  bun run report preview [--output screenshot.png]
  bun run report screenshot <html-file> [--output out.png]
  bun run report security <html-file> [--rendered] [--json]

Uses Bun.WebView + HTMLRewriter for report preview and web surface scanning.`);
		process.exit(0);
	}

	const command = positionals[0];

	switch (command) {
		case 'preview':
			await runPreview(values.output);
			return;
		case 'screenshot': {
			const htmlPath = positionals[1];
			if (!htmlPath) {
				console.error(colorize(TERMINAL.scannerFatal, '[report] html file path is required'));
				process.exit(1);
			}
			await runScreenshot(path.resolve(htmlPath), values.output);
			return;
		}
		case 'security': {
			const target = positionals[1];
			if (!target) {
				console.error(colorize(TERMINAL.scannerFatal, '[report] html file path is required'));
				process.exit(1);
			}
			await runSecurityScan(path.resolve(target), values.rendered === true, values.json === true);
			return;
		}
		default:
			console.error(
				colorize(TERMINAL.scannerFatal, `[report] unknown command: ${command ?? '(none)'}`),
			);
			process.exit(1);
	}
}

await runCliIfMain(main, import.meta.path);
