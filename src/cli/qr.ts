import path from 'path';
import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import {DEFAULT_MASTER_KEY_NAME, getMasterKey} from '../config/master-key.ts';
import {discoverDomainFiles} from '../config/loader.ts';
import {domainRegistry, type DomainRegistry} from '../config/registry.ts';
import {domainQrColors, domainServiceName, isReverseDnsDomain} from '../domain/branding.ts';
import {isImageAvailable, QRGenerator} from '../visual/index.ts';
import {
	formatQrCacheMappingLog,
	LEGACY_MASTER_TOKEN_SECRET,
	MASTER_TOKEN_SECRET,
	QRCache,
	type QrCacheMapping,
} from '../visual/qr-cache.ts';
import {cliBoolean, cliString, runCliIfMain} from '../utils/cli.ts';
import {
	qrFormatRequiresImage,
	resolveQrOutputFormat,
	type QrOutputFormat,
} from '../visual/qr-format.ts';

export interface DomainQrOptions {
	domain: string;
	output?: string;
	size?: number;
	terminal?: boolean;
	format?: string;
	dark?: string;
	light?: string;
	registry?: DomainRegistry;
}

export interface DomainQrResult {
	domain: string;
	serviceName: string;
	mapping?: QrCacheMapping;
	cachePath?: string;
	outputPath?: string;
	outputFormat?: QrOutputFormat;
	fromCache: boolean;
	dataUrlPreview?: string;
	terminalArt?: string;
}

const DEFAULT_QR_SIZE = 256;
const DATA_URL_PREVIEW_LEN = 96;

function resolveSize(size?: number): number {
	if (size === undefined) return DEFAULT_QR_SIZE;
	if (!Number.isFinite(size) || size <= 0) {
		throw new Error('--size must be a positive number');
	}
	return Math.floor(size);
}

function ensureSecretsApi(): void {
	if (typeof Bun.secrets === 'undefined') {
		throw new Error('Bun.secrets is not available in this Bun runtime');
	}
}

function privateVaultPath(domainFilePath: string, domain: string): string {
	return path.resolve(path.dirname(domainFilePath), '..', '.vault', `${domain}.inventory.json5`);
}

/**
 * Resolve Bun.secrets names to try for a domain master token (vault key first).
 */
export async function resolveDomainMasterKeyNames(
	domain: string,
	root = process.cwd(),
): Promise<string[]> {
	const ordered: string[] = [];
	const seen = new Set<string>();
	const push = (name: string) => {
		if (!seen.has(name)) {
			seen.add(name);
			ordered.push(name);
		}
	};

	for (const filePath of discoverDomainFiles(root)) {
		let publicRaw: Record<string, unknown>;
		try {
			publicRaw = Bun.JSON5.parse(await Bun.file(filePath).text()) as Record<string, unknown>;
		} catch {
			continue;
		}

		if (publicRaw.domain !== domain) {
			continue;
		}

		const privatePath = privateVaultPath(filePath, domain);
		if (await Bun.file(privatePath).exists()) {
			try {
				const privateRaw = Bun.JSON5.parse(await Bun.file(privatePath).text()) as {
					masterKeyName?: string;
				};
				if (typeof privateRaw.masterKeyName === 'string' && privateRaw.masterKeyName.length > 0) {
					push(privateRaw.masterKeyName);
				}
			} catch {
				// Best-effort — fall back to defaults.
			}
		}
		break;
	}

	push(DEFAULT_MASTER_KEY_NAME);
	push(LEGACY_MASTER_TOKEN_SECRET);
	return ordered;
}

export interface DomainMasterTokenResult {
	token: string;
	secretName: string;
}

/**
 * Read the domain master token from Bun.secrets.
 */
export async function getDomainMasterToken(
	serviceName: string,
	secretNames: string | string[] = MASTER_TOKEN_SECRET,
): Promise<string | null> {
	const resolved = await resolveDomainMasterToken(serviceName, secretNames);
	return resolved?.token ?? null;
}

/**
 * Read the domain master token and the Bun.secrets name it was stored under.
 */
export async function resolveDomainMasterToken(
	serviceName: string,
	secretNames: string | string[] = MASTER_TOKEN_SECRET,
): Promise<DomainMasterTokenResult | null> {
	ensureSecretsApi();
	const candidates = Array.isArray(secretNames) ? secretNames : [secretNames];

	for (const name of candidates) {
		const token = await getMasterKey({service: serviceName, name});
		if (token) {
			return {token, secretName: name};
		}
	}

	return null;
}

function qrRenderOptions(
	options: DomainQrOptions,
	size: number,
	palette?: {dark: string; light: string},
): {size: number; dark?: string; light?: string} {
	return {
		size,
		dark: options.dark ?? palette?.dark,
		light: options.light ?? palette?.light,
	};
}

export interface DomainQrMessages {
	mapping?: {text: string; fromCache: boolean};
	terminalArt?: string;
	saved?: {format: string; path: string};
	dataUrlPreview?: string;
	cachePath?: string;
}

/** Structured messages for domain QR output (CLI or REPL). */
export function domainQrMessages(result: DomainQrResult): DomainQrMessages {
	const messages: DomainQrMessages = {};

	if (result.mapping) {
		messages.mapping = {
			text: formatQrCacheMappingLog(result.mapping, result.fromCache),
			fromCache: result.fromCache,
		};
	}
	if (result.terminalArt) {
		messages.terminalArt = result.terminalArt;
	}
	if (result.outputPath) {
		messages.saved = {
			format: result.outputFormat ?? 'svg',
			path: result.outputPath,
		};
	}
	if (result.dataUrlPreview) {
		messages.dataUrlPreview = result.dataUrlPreview;
	}
	if (result.cachePath) {
		messages.cachePath = result.cachePath;
	}

	return messages;
}

/**
 * Generate (or load cached) QR for a domain master token.
 */
export async function runDomainQr(options: DomainQrOptions): Promise<DomainQrResult> {
	const registry = options.registry ?? domainRegistry;
	const domain = options.domain.trim();
	if (!domain) {
		throw new Error('--domain is required');
	}

	if (!isReverseDnsDomain(domain)) {
		throw new Error(`domain must be a valid reverse-DNS identifier: ${domain}`);
	}

	const outputFormat = resolveQrOutputFormat({
		terminal: options.terminal,
		format: options.format,
		output: options.output,
	});

	if (outputFormat && qrFormatRequiresImage(outputFormat) && !isImageAvailable()) {
		throw new Error('Bun.Image is not available in this runtime');
	}

	await registry.loadAll();
	if (!registry.has(domain)) {
		throw new Error(`unknown domain: ${domain}`);
	}

	const config = registry.get(domain);
	const serviceName = domainServiceName(config);
	const palette = domainQrColors(config);
	const secretNames = await resolveDomainMasterKeyNames(domain);
	const resolved = await resolveDomainMasterToken(serviceName, secretNames);
	if (!resolved) {
		throw new Error(
			`no master token found in Bun.secrets (service=${serviceName}, tried=${secretNames.join(', ')})`,
		);
	}
	const {token, secretName} = resolved;

	const size = resolveSize(options.size);
	const renderOptions = qrRenderOptions(options, size, palette);

	let mapping: QrCacheMapping | undefined;
	let cachePath: string | undefined;
	let fromCache = false;
	let image: Bun.Image | undefined;

	if (outputFormat === 'png' || outputFormat === 'webp') {
		const ensured = await QRCache.ensure(domain, token, serviceName, renderOptions, secretName);
		mapping = ensured.mapping;
		cachePath = ensured.mapping.path;
		fromCache = ensured.fromCache;
		image = ensured.image;
	}

	let outputPath: string | undefined;
	if (options.output) {
		outputPath = path.resolve(options.output);
		await mkdirParent(outputPath);

		if (outputFormat === 'png' && image) {
			await image.png().write(outputPath);
		} else if (outputFormat === 'webp' && image) {
			await image.webp({quality: 90}).write(outputPath);
		} else if (outputFormat) {
			await QRGenerator.write(token, outputPath, outputFormat, renderOptions);
		}
	}

	let terminalArt: string | undefined;
	if (outputFormat === 'terminal') {
		terminalArt = await QRGenerator.toTerminal(token, renderOptions);
	}

	let dataUrlPreview: string | undefined;
	if (!outputFormat || outputFormat === 'png') {
		const dataUrl = await QRGenerator.generate(token, renderOptions);
		dataUrlPreview =
			dataUrl.length > DATA_URL_PREVIEW_LEN
				? `${dataUrl.slice(0, DATA_URL_PREVIEW_LEN)}…`
				: dataUrl;
	}

	return {
		domain,
		serviceName,
		mapping,
		cachePath,
		outputPath,
		outputFormat,
		fromCache,
		dataUrlPreview,
		terminalArt,
	};
}

export interface DomainQrMessageSink {
	log(line: string): void;
	logErr(line: string): void;
}

/** Write domain QR messages with terminal styling. */
export function printDomainQrMessages(
	messages: DomainQrMessages,
	sink: DomainQrMessageSink,
	prefix = '[sp]',
): void {
	if (messages.mapping) {
		sink.logErr(
			colorize(
				messages.mapping.fromCache ? TERMINAL.scannerDim : TERMINAL.scannerOk,
				messages.mapping.text,
			),
		);
	}

	if (messages.terminalArt) {
		sink.log(messages.terminalArt);
		return;
	}

	if (messages.saved) {
		sink.log(
			colorize(
				TERMINAL.scannerOk,
				`${prefix} qr saved (${messages.saved.format}) → ${messages.saved.path}`,
			),
		);
		return;
	}

	if (messages.dataUrlPreview) {
		sink.log(colorize(TERMINAL.scannerInfo, `${prefix} qr data: ${messages.dataUrlPreview}`));
	}
	if (messages.cachePath) {
		sink.log(colorize(TERMINAL.scannerDim, `${prefix} cache: ${messages.cachePath}`));
	}
}

async function mkdirParent(filePath: string): Promise<void> {
	const {mkdir} = await import('fs/promises');
	await mkdir(path.dirname(filePath), {recursive: true});
}

/**
 * CLI entry for `bun sp qr --domain <name>`.
 */
export async function runQrCli(options: DomainQrOptions): Promise<void> {
	try {
		const result = await runDomainQr(options);
		printDomainQrMessages(domainQrMessages(result), {
			log: line => console.log(line),
			logErr: line => console.error(line),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(colorize(TERMINAL.scannerFatal, `[sp] qr: ${message}`));
		process.exit(1);
	}
}

async function main(): Promise<void> {
	const parsed = parseArgs({
		args: Bun.argv,
		options: {
			domain: {type: 'string'},
			output: {type: 'string'},
			out: {type: 'string'},
			size: {type: 'string'},
			terminal: {type: 'boolean'},
			format: {type: 'string'},
			dark: {type: 'string'},
			light: {type: 'string'},
			help: {type: 'boolean', short: 'h'},
		},
		strict: false,
		allowPositionals: true,
	});

	if (parsed.values.help) {
		console.log(`Usage:
  bun run qr --domain <reverse-dns> [--terminal] [--format svg|png|webp] [--out path] [--size N]
  bun sp qr --domain <reverse-dns> [same flags]

Reads the domain vault master key from Bun.secrets, generates a QR via Bun.Image,
and caches PNGs under ~/.bun/security-scanner/qr-cache keyed by Bun.hash(domain:token).`);
		process.exit(0);
	}

	await runQrCli({
		domain: cliString(parsed.values.domain) ?? '',
		output: cliString(parsed.values.output) ?? cliString(parsed.values.out),
		size: cliString(parsed.values.size) ? Number(cliString(parsed.values.size)) : undefined,
		terminal: cliBoolean(parsed.values.terminal),
		format: cliString(parsed.values.format),
		dark: cliString(parsed.values.dark),
		light: cliString(parsed.values.light),
	});
}

await runCliIfMain(main, import.meta.path);
