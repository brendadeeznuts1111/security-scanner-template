import path from 'path';
import {mkdir} from 'fs/promises';
import type {AuditEntry, AuditVisualArtifact} from '../audit/types.ts';
import {webpPathFor} from './convert.ts';
import {ImagePipeline} from './pipeline.ts';
import {PlaceholderGenerator} from './placeholder.ts';
import {ThumbnailGenerator, thumbnailPathFor} from './thumb.ts';
import type {ImageFormat, ImageSource, ThumbnailOptions} from './types.ts';

export interface AuditVisualOptions extends ThumbnailOptions {
	/** Original image path stored on the audit entry. */
	imagePath?: string;
	/** Explicit thumbnail output path (defaults to sidecar next to imagePath). */
	thumbnailPath?: string;
	/** Directory for thumbnails when imagePath is not set. */
	outDir?: string;
	/** Strip EXIF and normalize to WebP before persisting (default: true). */
	normalize?: boolean;
	/** Run metadata anomaly inspection (default: true). */
	inspect?: boolean;
}

/**
 * Attach visual artifacts (thumbnail + placeholder) to audit entries.
 */
export class AuditVisualProcessor {
	/**
	 * Generate thumbnail and placeholder metadata for an audit entry.
	 */
	static async enrich(
		entry: AuditEntry,
		source: ImageSource,
		options: AuditVisualOptions = {},
	): Promise<AuditEntry> {
		const format = options.format ?? 'webp';
		const normalize = options.normalize ?? true;
		const inspect = options.inspect ?? true;

		let workingSource: ImageSource = source;
		let normalizedPath: string | undefined;
		let anomalies: AuditVisualArtifact['anomalies'];

		if (normalize) {
			const normalizedDest =
				options.imagePath !== undefined
					? webpPathFor(options.imagePath)
					: path.join(options.outDir ?? '.security/visual', `${entry.id}.webp`);

			const pipeline = await ImagePipeline.process(source, {
				inspect,
				stripExif: true,
				convertWebp: true,
				dest: normalizedDest,
			});

			workingSource = pipeline.bytes;
			normalizedPath = pipeline.normalizedPath;
			anomalies = pipeline.inspection?.anomalies;
		}

		const thumbnailPath =
			options.thumbnailPath ??
			(normalizedPath
				? thumbnailPathFor(normalizedPath, format)
				: options.imagePath
					? thumbnailPathFor(options.imagePath, format)
					: path.join(options.outDir ?? '.security/visual', `${entry.id}.thumb.${format}`));

		await mkdir(path.dirname(thumbnailPath), {recursive: true});
		await ThumbnailGenerator.save(
			workingSource,
			thumbnailPath,
			options.width,
			options.height,
			format,
			options.quality,
		);

		const placeholderDataUrl = await PlaceholderGenerator.generate(workingSource);

		const visual: AuditVisualArtifact = {
			imagePath: options.imagePath,
			normalizedPath,
			thumbnailPath,
			placeholderDataUrl,
			anomalies,
		};

		return {...entry, visual};
	}
}