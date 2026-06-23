import path from 'path';
import {mkdir} from 'fs/promises';
import {encodeImage} from './encode.ts';
import {loadImage} from './load.ts';
import type {ImageMetadataInfo} from './metadata.ts';
import type {ImageSource} from './types.ts';

export interface WebpConversionResult {
	image: Bun.Image;
	bytes: Uint8Array;
	metadata: ImageMetadataInfo;
}

/**
 * Convert decoded pixels to WebP for smaller audit/storage footprints.
 */
export class ImageConverter {
	static async toWebp(source: ImageSource, quality: number = 80): Promise<WebpConversionResult> {
		const image = await loadImage(source);
		const encoded = encodeImage(image, 'webp', quality);
		const metadata = await encoded.metadata();
		const bytes = await encoded.bytes();

		return {image: encoded, bytes, metadata};
	}

	static async toWebpFile(
		source: ImageSource,
		dest: string,
		quality: number = 80,
	): Promise<string> {
		const {image} = await ImageConverter.toWebp(source, quality);
		await mkdir(path.dirname(dest), {recursive: true});
		await image.write(dest);
		return dest;
	}
}

/**
 * Derive a WebP path from any image filename.
 */
export function webpPathFor(sourcePath: string): string {
	const ext = path.extname(sourcePath);
	const base = sourcePath.slice(0, ext.length > 0 ? -ext.length : undefined);
	return `${base}.webp`;
}
