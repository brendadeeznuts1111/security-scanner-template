import {encodeImage} from './encode.ts';
import {loadImage} from './load.ts';
import type {ImageFormat, ImageSource} from './types.ts';

export interface SanitizedImageResult {
	image: Bun.Image;
	bytes: Uint8Array;
	format: ImageFormat;
}

/**
 * Re-encode images through Bun.Image to strip EXIF and embedded metadata.
 */
export class ImageSanitizer {
	/**
	 * Decode and re-encode without preserving metadata containers (EXIF, etc.).
	 */
	static async stripMetadata(
		source: ImageSource,
		format: ImageFormat = 'webp',
		quality: number = 85,
	): Promise<SanitizedImageResult> {
		const image = await loadImage(source);
		const encoded = encodeImage(image, format, quality);
		const bytes = await encoded.bytes();

		return {image: encoded, bytes, format};
	}

	static async stripMetadataToFile(
		source: ImageSource,
		dest: string,
		format: ImageFormat = 'webp',
		quality: number = 85,
	): Promise<SanitizedImageResult & {path: string}> {
		const result = await ImageSanitizer.stripMetadata(source, format, quality);
		await result.image.write(dest);
		return {...result, path: dest};
	}
}