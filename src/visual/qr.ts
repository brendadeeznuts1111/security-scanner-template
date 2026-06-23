import QRCode from 'qrcode';
import {encodeImage} from './encode.ts';
import {loadImage} from './load.ts';
import type {QrOutputFormat} from './qr-format.ts';

export interface QRGenerateOptions {
	size?: number;
	errorCorrection?: 'L' | 'M' | 'Q' | 'H';
	dark?: string;
	light?: string;
}

function qrColorOptions(options: QRGenerateOptions): {dark?: string; light?: string} | undefined {
	const color: {dark?: string; light?: string} = {};
	if (options.dark) color.dark = options.dark;
	if (options.light) color.light = options.light;
	return Object.keys(color).length > 0 ? color : undefined;
}

function baseRenderOptions(options: QRGenerateOptions = {}) {
	return {
		width: options.size ?? 256,
		errorCorrectionLevel: options.errorCorrection ?? 'M',
		margin: 1,
		color: qrColorOptions(options),
	};
}

/**
 * Encode tokens or audit URLs as QR images via the `qrcode` package.
 */
export class QRGenerator {
	/**
	 * Generate a QR code as a PNG data URL (base64).
	 */
	static async generate(text: string, options: QRGenerateOptions = {}): Promise<string> {
		return QRCode.toDataURL(text, baseRenderOptions(options));
	}

	/** Alias for {@link generate}. */
	static async generateDataUrl(text: string, options: QRGenerateOptions = {}): Promise<string> {
		return QRGenerator.generate(text, options);
	}

	/** Render QR as an SVG string. */
	static async toSvg(text: string, options: QRGenerateOptions = {}): Promise<string> {
		return QRCode.toString(text, {
			...baseRenderOptions(options),
			type: 'svg',
		});
	}

	/** Render QR as terminal ASCII art (UTF-8 blocks). */
	static async toTerminal(text: string, options: QRGenerateOptions = {}): Promise<string> {
		const scale =
			options.size !== undefined ? Math.max(1, Math.min(8, Math.floor(options.size / 32))) : 2;

		return QRCode.toString(text, {
			type: 'utf8',
			errorCorrectionLevel: options.errorCorrection ?? 'M',
			margin: 2,
			scale,
			color: qrColorOptions(options),
		});
	}

	/**
	 * Generate a Bun.Image directly from a QR data URL.
	 */
	static async toImage(text: string, options: QRGenerateOptions = {}): Promise<Bun.Image> {
		const dataUrl = await QRGenerator.generate(text, options);
		return new Bun.Image(dataUrl);
	}

	static async fromDataUrl(dataUrl: string): Promise<Bun.Image> {
		return loadImage(dataUrl);
	}

	static async fromPath(filePath: string): Promise<Bun.Image> {
		return loadImage(filePath);
	}

	/**
	 * Write QR to disk in the requested format.
	 */
	static async write(
		text: string,
		dest: string,
		format: QrOutputFormat,
		options: QRGenerateOptions = {},
	): Promise<void> {
		switch (format) {
			case 'terminal': {
				const art = await QRGenerator.toTerminal(text, options);
				await Bun.write(dest, art);
				return;
			}
			case 'svg': {
				const svg = await QRGenerator.toSvg(text, options);
				await Bun.write(dest, svg);
				return;
			}
			case 'png': {
				const image = await QRGenerator.toImage(text, options);
				await image.png().write(dest);
				return;
			}
			case 'webp': {
				const image = await QRGenerator.toImage(text, options);
				await encodeImage(image, 'webp', 90).write(dest);
				return;
			}
		}
	}

	static async save(text: string, dest: string, options: QRGenerateOptions = {}): Promise<void> {
		const dataUrl = await QRGenerator.generate(text, options);
		await Bun.write(dest, dataUrl);
	}
}