import path from 'path';
import {mkdir} from 'fs/promises';
import {encodeImage} from './encode.ts';
import {loadImage} from './load.ts';
import type {ImageFormat, ImageSource, ThumbnailOptions, ThumbnailResult} from './types.ts';

const DEFAULT_WIDTH = 200;
const DEFAULT_HEIGHT = 200;
const DEFAULT_FORMAT: ImageFormat = 'webp';
const DEFAULT_QUALITY = 80;

/**
 * Generate thumbnails from scan screenshots, uploads, or other image sources.
 */
export class ThumbnailGenerator {
	/**
	 * Generate a thumbnail Bun.Image ready to save or stream.
	 */
	static async generate(
		source: ImageSource,
		width: number = DEFAULT_WIDTH,
		height: number = DEFAULT_HEIGHT,
		format: ImageFormat = DEFAULT_FORMAT,
		quality: number = DEFAULT_QUALITY,
		resize: ThumbnailOptions['resize'] = {fit: 'inside', withoutEnlargement: true},
	): Promise<ThumbnailResult> {
		const image = await loadImage(source);
		const resized = image.resize(width, height, resize);
		const encoded = encodeImage(resized, format, quality);
		const metadata = await encoded.metadata();
		return {image: encoded, metadata};
	}

	/**
	 * Generate from an options bag (used by Service/CLI).
	 */
	static async generateFromOptions(
		source: ImageSource,
		options: ThumbnailOptions = {},
	): Promise<ThumbnailResult> {
		return ThumbnailGenerator.generate(
			source,
			options.width ?? DEFAULT_WIDTH,
			options.height ?? DEFAULT_HEIGHT,
			options.format ?? DEFAULT_FORMAT,
			options.quality ?? DEFAULT_QUALITY,
			options.resize ?? {fit: 'inside', withoutEnlargement: true},
		);
	}

	/**
	 * Save a thumbnail next to or at an explicit destination path.
	 */
	static async save(
		source: ImageSource,
		dest: string,
		width?: number,
		height?: number,
		format: ImageFormat = DEFAULT_FORMAT,
		quality: number = DEFAULT_QUALITY,
	): Promise<string> {
		const {image} = await ThumbnailGenerator.generate(source, width, height, format, quality);
		await mkdir(path.dirname(dest), {recursive: true});
		await image.write(dest);
		return dest;
	}
}

/**
 * Derive a sidecar thumbnail path from a source image path.
 */
export function thumbnailPathFor(sourcePath: string, format: ImageFormat = 'webp'): string {
	const ext = path.extname(sourcePath);
	const base = sourcePath.slice(0, ext.length > 0 ? -ext.length : undefined);
	return `${base}.thumb.${format}`;
}
