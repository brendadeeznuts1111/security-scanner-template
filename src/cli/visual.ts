#!/usr/bin/env bun
import {parseArgs} from 'util';
import path from 'path';
import {colorize, TERMINAL} from '../color/index.ts';
import {domainRegistry} from '../config/registry.ts';
import {
	ImageConverter,
	ImageMetadataAnalyzer,
	ImagePipeline,
	ImageSanitizer,
	isImageAvailable,
	PlaceholderGenerator,
	QRGenerator,
	ReportImageRenderer,
	ThumbnailGenerator,
	webpPathFor,
} from '../visual/index.ts';
import {
	qrFormatRequiresImage,
	resolveQrOutputFormat,
} from '../visual/qr-format.ts';
import {runCliIfMain} from '../utils/cli.ts';

const HELP = `Usage:
  bun run visual thumb --input <path> [--output <path>] [--width N] [--height N] [--format webp|jpeg|png]
  bun run visual placeholder --input <path>
  bun run visual inspect --input <path>
  bun run visual sanitize --input <path> [--output <path>] [--format webp|jpeg|png]
  bun run visual convert --input <path> [--output <path>] [--quality N]
  bun run visual pipeline --input <path> [--output <path>]
  bun run visual qr --text <value> [--out path] [--terminal] [--format svg|png|webp] [--dark #hex] [--light #hex]
  bun run visual qr --data-url <png-data-url> --out <path>
  bun run visual report-image --html <path> [--output <path>] [--width N]
  bun run visual audit thumbnail --id <id> --input <path> --domain <domain>

Generate visual audit artifacts with Bun.Image.`;

function requireImageRuntime(): void {
	if (!isImageAvailable()) {
		console.error(colorize(TERMINAL.scannerFatal, '[visual] Bun.Image is not available'));
		process.exit(1);
	}
}

async function runThumb(values: Record<string, unknown>): Promise<void> {
	requireImageRuntime();
	const input = values.input as string | undefined;
	if (!input) {
		console.error(colorize(TERMINAL.scannerFatal, '[visual] --input is required'));
		process.exit(1);
	}

	const format = (values.format as 'jpeg' | 'png' | 'webp' | undefined) ?? 'webp';
	const output =
		(values.output as string | undefined) ??
		path.join(
			path.dirname(path.resolve(input)),
			`${path.basename(input, path.extname(input))}.thumb.${format}`,
		);

	const width = values.width ? Number(values.width) : undefined;
	const height = values.height ? Number(values.height) : undefined;
	const quality = values.quality ? Number(values.quality) : undefined;

	const dest = await ThumbnailGenerator.save(
		path.resolve(input),
		path.resolve(output),
		width,
		height,
		format,
		quality,
	);

	console.log(colorize(TERMINAL.scannerOk, `[visual] thumbnail → ${dest}`));
}

async function runPlaceholder(values: Record<string, unknown>): Promise<void> {
	requireImageRuntime();
	const input = values.input as string | undefined;
	if (!input) {
		console.error(colorize(TERMINAL.scannerFatal, '[visual] --input is required'));
		process.exit(1);
	}

	const dataUrl = await PlaceholderGenerator.generate(path.resolve(input));
	console.log(dataUrl);
}

async function runQr(values: Record<string, unknown>): Promise<void> {
	const dataUrl = values['data-url'] as string | undefined;
	const output = (values.output as string | undefined) ?? (values.out as string | undefined);
	const terminal = values.terminal === true;
	const format = values.format as string | undefined;
	const dark = values.dark as string | undefined;
	const light = values.light as string | undefined;
	const size = values.size ? Number(values.size) : undefined;

	if (dataUrl) {
		requireImageRuntime();
		const image = await QRGenerator.fromDataUrl(dataUrl);
		if (!output) {
			console.error(colorize(TERMINAL.scannerFatal, '[visual] --out is required with --data-url'));
			process.exit(1);
		}
		await image.write(path.resolve(output));
		console.log(colorize(TERMINAL.scannerOk, `[visual] qr image → ${path.resolve(output)}`));
		return;
	}

	const text = values.text as string | undefined;
	if (!text) {
		console.error(
			colorize(
				TERMINAL.scannerFatal,
				'[visual] qr requires --text, or --data-url and --out',
			),
		);
		process.exit(1);
	}

	const outputFormat = resolveQrOutputFormat({terminal, format, output});
	if (outputFormat && qrFormatRequiresImage(outputFormat) && !isImageAvailable()) {
		console.error(colorize(TERMINAL.scannerFatal, '[visual] Bun.Image is not available'));
		process.exit(1);
	}

	const renderOptions = {
		size: size && Number.isFinite(size) && size > 0 ? Math.floor(size) : undefined,
		dark,
		light,
	};

	if (outputFormat === 'terminal') {
		const art = await QRGenerator.toTerminal(text, renderOptions);
		console.log(art);
		return;
	}

	if (!output) {
		console.error(
			colorize(
				TERMINAL.scannerFatal,
				'[visual] qr requires --out <path> unless --terminal is set',
			),
		);
		process.exit(1);
	}

	const dest = path.resolve(output);
	if (outputFormat) {
		await QRGenerator.write(text, dest, outputFormat, renderOptions);
		console.log(colorize(TERMINAL.scannerOk, `[visual] qr (${outputFormat}) → ${dest}`));
		return;
	}

	requireImageRuntime();
	await QRGenerator.save(text, dest, renderOptions);
	console.log(colorize(TERMINAL.scannerOk, `[visual] qr → ${dest}`));
}

async function runReportImage(values: Record<string, unknown>): Promise<void> {
	if (!ReportImageRenderer.isAvailable()) {
		console.error(colorize(TERMINAL.scannerFatal, '[visual] Bun.WebView is not available'));
		process.exit(1);
	}

	const htmlPath = values.html as string | undefined;
	if (!htmlPath) {
		console.error(colorize(TERMINAL.scannerFatal, '[visual] --html is required'));
		process.exit(1);
	}

	const html = await Bun.file(path.resolve(htmlPath)).text();
	const result = await ReportImageRenderer.render(html, {
		outputPath: values.output ? path.resolve(values.output as string) : undefined,
		width: values.width ? Number(values.width) : 1024,
		height: values.height ? Number(values.height) : 768,
	});

	console.log(colorize(TERMINAL.scannerOk, `[visual] report image → ${result.path}`));
}

async function runInspect(values: Record<string, unknown>): Promise<void> {
	requireImageRuntime();
	const input = values.input as string | undefined;
	if (!input) {
		console.error(colorize(TERMINAL.scannerFatal, '[visual] --input is required'));
		process.exit(1);
	}

	const inspection = await ImageMetadataAnalyzer.inspect(path.resolve(input));
	console.log(JSON.stringify(inspection, null, 2));
}

async function runSanitize(values: Record<string, unknown>): Promise<void> {
	requireImageRuntime();
	const input = values.input as string | undefined;
	if (!input) {
		console.error(colorize(TERMINAL.scannerFatal, '[visual] --input is required'));
		process.exit(1);
	}

	const resolved = path.resolve(input);
	const format = (values.format as 'jpeg' | 'png' | 'webp' | undefined) ?? 'webp';
	const output =
		(values.output as string | undefined) ??
		(format === 'webp' ? webpPathFor(resolved) : `${resolved}.sanitized.${format}`);
	const quality = values.quality ? Number(values.quality) : 85;

	const result = await ImageSanitizer.stripMetadataToFile(resolved, path.resolve(output), format, quality);
	console.log(
		colorize(
			TERMINAL.scannerOk,
			`[visual] sanitized (${result.format}, EXIF stripped) → ${path.resolve(output)}`,
		),
	);
}

async function runConvert(values: Record<string, unknown>): Promise<void> {
	requireImageRuntime();
	const input = values.input as string | undefined;
	if (!input) {
		console.error(colorize(TERMINAL.scannerFatal, '[visual] --input is required'));
		process.exit(1);
	}

	const resolved = path.resolve(input);
	const output = (values.output as string | undefined) ?? webpPathFor(resolved);
	const quality = values.quality ? Number(values.quality) : 80;

	const dest = await ImageConverter.toWebpFile(resolved, path.resolve(output), quality);
	console.log(colorize(TERMINAL.scannerOk, `[visual] webp → ${dest}`));
}

async function runPipeline(values: Record<string, unknown>): Promise<void> {
	requireImageRuntime();
	const input = values.input as string | undefined;
	if (!input) {
		console.error(colorize(TERMINAL.scannerFatal, '[visual] --input is required'));
		process.exit(1);
	}

	const resolved = path.resolve(input);
	const output = (values.output as string | undefined) ?? webpPathFor(resolved);
	const quality = values.quality ? Number(values.quality) : 80;

	const result = await ImagePipeline.process(resolved, {
		inspect: true,
		stripExif: true,
		convertWebp: true,
		quality,
		dest: path.resolve(output),
	});

	console.log(
		colorize(
			TERMINAL.scannerOk,
			`[visual] pipeline → ${result.normalizedPath ?? path.resolve(output)} (${result.format})`,
		),
	);
	if (result.inspection?.anomalies.length) {
		for (const anomaly of result.inspection.anomalies) {
			console.error(
				colorize(TERMINAL.scannerWarn, `  ${anomaly.severity} ${anomaly.code}: ${anomaly.message}`),
			);
		}
	}
}

async function runAuditThumbnail(values: Record<string, unknown>): Promise<void> {
	requireImageRuntime();
	const id = values.id as string | undefined;
	const input = values.input as string | undefined;
	const domain = values.domain as string | undefined;

	if (!id || !input || !domain) {
		console.error(
			colorize(TERMINAL.scannerFatal, '[visual] audit thumbnail requires --id, --input, --domain'),
		);
		process.exit(1);
	}

	await domainRegistry.loadAll();
	const service = await domainRegistry.service(domain, () => new Response('ok'));
	const enriched = await service.generateAuditThumbnailForEntry(id, path.resolve(input), {
		imagePath: path.resolve(input),
	});
	console.log(
		colorize(
			TERMINAL.scannerOk,
			`[visual] audit ${id} thumbnail → ${enriched.visual?.thumbnailPath ?? '(none)'}`,
		),
	);
	service.close();
}

async function main(): Promise<void> {
	const {values, positionals} = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			input: {type: 'string'},
			output: {type: 'string'},
			out: {type: 'string'},
			terminal: {type: 'boolean'},
			dark: {type: 'string'},
			light: {type: 'string'},
			size: {type: 'string'},
			width: {type: 'string'},
			height: {type: 'string'},
			format: {type: 'string'},
			quality: {type: 'string'},
			text: {type: 'string'},
			'data-url': {type: 'string'},
			html: {type: 'string'},
			id: {type: 'string'},
			domain: {type: 'string'},
			help: {type: 'boolean', short: 'h'},
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(HELP);
		process.exit(0);
	}

	const command = positionals[0];
	switch (command) {
		case 'thumb':
			await runThumb(values);
			return;
		case 'placeholder':
			await runPlaceholder(values);
			return;
		case 'inspect':
			await runInspect(values);
			return;
		case 'sanitize':
			await runSanitize(values);
			return;
		case 'convert':
			await runConvert(values);
			return;
		case 'pipeline':
			await runPipeline(values);
			return;
		case 'qr':
			await runQr(values);
			return;
		case 'report-image':
			await runReportImage(values);
			return;
		case 'audit':
			if (positionals[1] === 'thumbnail') {
				await runAuditThumbnail(values);
				return;
			}
			break;
		default:
			break;
	}

	console.error(colorize(TERMINAL.scannerFatal, `[visual] unknown command: ${command ?? '(none)'}`));
	console.error(colorize(TERMINAL.scannerDim, 'Try: bun run visual --help'));
	process.exit(1);
}

await runCliIfMain(main);