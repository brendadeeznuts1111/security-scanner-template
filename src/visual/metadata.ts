import {loadImage} from './load.ts';
import type {ImageSource} from './types.ts';

export interface ImageMetadataInfo {
	width: number;
	height: number;
	format: string;
}

export type ImageAnomalyCode =
	| 'oversized-dimensions'
	| 'oversized-file'
	| 'unusual-format'
	| 'extreme-aspect-ratio';

export interface ImageAnomaly {
	code: ImageAnomalyCode;
	severity: 'warn' | 'info';
	message: string;
	value?: string | number;
}

export interface ImageInspection {
	metadata: ImageMetadataInfo;
	sourceBytes?: number;
	anomalies: ImageAnomaly[];
}

export interface ImageInspectionOptions {
	maxWidth?: number;
	maxHeight?: number;
	maxBytes?: number;
	maxAspectRatio?: number;
	allowedFormats?: readonly string[];
}

const DEFAULT_MAX_WIDTH = 8192;
const DEFAULT_MAX_HEIGHT = 8192;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_ASPECT_RATIO = 20;
const DEFAULT_ALLOWED_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'avif', 'heic'] as const;

async function sourceByteLength(source: ImageSource): Promise<number | undefined> {
	if (typeof source === 'string' && !source.startsWith('data:')) {
		const file = Bun.file(source);
		if (await file.exists()) {
			return file.size;
		}
	}

	if (source instanceof Uint8Array) {
		return source.byteLength;
	}

	if (source instanceof ArrayBuffer) {
		return source.byteLength;
	}

	if (source instanceof Blob) {
		return source.size;
	}

	return undefined;
}

/**
 * Inspect image dimensions/format and flag upload anomalies.
 */
export class ImageMetadataAnalyzer {
	static async inspect(
		source: ImageSource,
		options: ImageInspectionOptions = {},
	): Promise<ImageInspection> {
		const image = await loadImage(source);
		const metadata = await image.metadata();
		const sourceBytes = await sourceByteLength(source);

		const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
		const maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;
		const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
		const maxAspectRatio = options.maxAspectRatio ?? DEFAULT_MAX_ASPECT_RATIO;
		const allowedFormats = options.allowedFormats ?? DEFAULT_ALLOWED_FORMATS;

		const anomalies: ImageAnomaly[] = [];
		const format = metadata.format.toLowerCase();

		if (metadata.width > maxWidth || metadata.height > maxHeight) {
			anomalies.push({
				code: 'oversized-dimensions',
				severity: 'warn',
				message: `Image dimensions exceed ${maxWidth}x${maxHeight}`,
				value: `${metadata.width}x${metadata.height}`,
			});
		}

		if (sourceBytes !== undefined && sourceBytes > maxBytes) {
			anomalies.push({
				code: 'oversized-file',
				severity: 'warn',
				message: `Image file exceeds ${maxBytes} bytes`,
				value: sourceBytes,
			});
		}

		if (!allowedFormats.includes(format)) {
			anomalies.push({
				code: 'unusual-format',
				severity: 'warn',
				message: 'Image format is not in the allowed set',
				value: format,
			});
		}

		const shortSide = Math.min(metadata.width, metadata.height);
		const longSide = Math.max(metadata.width, metadata.height);
		if (shortSide > 0 && longSide / shortSide > maxAspectRatio) {
			anomalies.push({
				code: 'extreme-aspect-ratio',
				severity: 'info',
				message: `Aspect ratio exceeds ${maxAspectRatio}:1`,
				value: Number((longSide / shortSide).toFixed(2)),
			});
		}

		return {
			metadata,
			sourceBytes,
			anomalies,
		};
	}
}