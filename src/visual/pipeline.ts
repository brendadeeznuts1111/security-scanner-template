import path from 'path';
import {mkdir} from 'fs/promises';
import {ImageConverter} from './convert.ts';
import {ImageMetadataAnalyzer, type ImageInspection} from './metadata.ts';
import {ImageSanitizer} from './sanitize.ts';
import type {ImageFormat, ImageSource} from './types.ts';

export interface ImagePipelineOptions {
	/** Run anomaly inspection before transforms. */
	inspect?: boolean;
	/** Re-encode to strip EXIF/embedded metadata (default: true). */
	stripExif?: boolean;
	/** Persist output as WebP (default: true). */
	convertWebp?: boolean;
	quality?: number;
	outputFormat?: ImageFormat;
	/** Optional explicit output path. */
	dest?: string;
}

export interface ImagePipelineResult {
	inspection?: ImageInspection;
	bytes: Uint8Array;
	format: ImageFormat;
	normalizedPath?: string;
	strippedExif: boolean;
	convertedToWebp: boolean;
}

/**
 * End-to-end Bun.Image pipeline: inspect → strip EXIF → convert to WebP.
 */
export class ImagePipeline {
	static async process(
		source: ImageSource,
		options: ImagePipelineOptions = {},
	): Promise<ImagePipelineResult> {
		const inspect = options.inspect ?? true;
		const stripExif = options.stripExif ?? true;
		const convertWebp = options.convertWebp ?? true;
		const quality = options.quality ?? 80;
		const format: ImageFormat =
			options.outputFormat ?? (convertWebp ? 'webp' : stripExif ? 'png' : 'webp');

		const inspection = inspect ? await ImageMetadataAnalyzer.inspect(source) : undefined;

		let bytes: Uint8Array;
		if (stripExif || convertWebp) {
			const targetFormat = convertWebp ? 'webp' : format;
			const sanitized = await ImageSanitizer.stripMetadata(source, targetFormat, quality);
			bytes = sanitized.bytes;
		} else {
			const converted = await ImageConverter.toWebp(source, quality);
			bytes = converted.bytes;
		}

		let normalizedPath: string | undefined;
		if (options.dest) {
			normalizedPath = path.resolve(options.dest);
			await mkdir(path.dirname(normalizedPath), {recursive: true});
			await Bun.write(normalizedPath, bytes);
		}

		return {
			inspection,
			bytes,
			format: convertWebp ? 'webp' : format,
			normalizedPath,
			strippedExif: stripExif,
			convertedToWebp: convertWebp,
		};
	}
}