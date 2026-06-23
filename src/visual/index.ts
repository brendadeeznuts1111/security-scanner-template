export type {
	EncodeOptions,
	ImageFormat,
	ImageSource,
	ResizeOptions,
	ThumbnailOptions,
	ThumbnailResult,
} from './types.ts';

export {
	ImageMetadataAnalyzer,
	type ImageAnomaly,
	type ImageAnomalyCode,
	type ImageInspection,
	type ImageInspectionOptions,
	type ImageMetadataInfo,
} from './metadata.ts';
export {ImageSanitizer, type SanitizedImageResult} from './sanitize.ts';
export {ImageConverter, webpPathFor, type WebpConversionResult} from './convert.ts';
export {ImagePipeline, type ImagePipelineOptions, type ImagePipelineResult} from './pipeline.ts';
export {encodeImage} from './encode.ts';
export {isImageAvailable, loadImage, requireImage} from './load.ts';
export {AuditVisualProcessor, type AuditVisualOptions} from './audit.ts';
export {PlaceholderGenerator} from './placeholder.ts';
export {QRGenerator, type QRGenerateOptions} from './qr.ts';
export {resolveQrOutputFormat, qrFormatRequiresImage, type QrOutputFormat} from './qr-format.ts';
export {
	QRCache,
	LEGACY_MASTER_TOKEN_SECRET,
	MASTER_TOKEN_SECRET,
	buildQrCacheMapping,
	formatQrCacheMappingLog,
	qrCacheDir,
	qrCacheDomainDir,
	qrCacheKey,
	qrCacheKeyPair,
	qrCachePath,
	type QrCacheIndex,
	type QrCacheKeyPair,
	type QrCacheMapping,
} from './qr-cache.ts';
export {
	ReportImageRenderer,
	type ReportImageOptions,
	type ReportImageResult,
} from './report-image.ts';
export {ThumbnailGenerator, thumbnailPathFor} from './thumb.ts';

import {AuditVisualProcessor} from './audit.ts';
import {ImageConverter} from './convert.ts';
import {isImageAvailable} from './load.ts';
import {ImageMetadataAnalyzer} from './metadata.ts';
import {ImagePipeline} from './pipeline.ts';
import {PlaceholderGenerator} from './placeholder.ts';
import {QRGenerator} from './qr.ts';
import {ReportImageRenderer} from './report-image.ts';
import {ImageSanitizer} from './sanitize.ts';
import {ThumbnailGenerator} from './thumb.ts';

/**
 * Visual processing helpers exposed on Registry.
 */
export class VisualRegistry {
	readonly thumb = ThumbnailGenerator;
	readonly placeholder = PlaceholderGenerator;
	readonly qr = QRGenerator;
	readonly reportImage = ReportImageRenderer;
	readonly audit = AuditVisualProcessor;
	readonly metadata = ImageMetadataAnalyzer;
	readonly sanitize = ImageSanitizer;
	readonly convert = ImageConverter;
	readonly pipeline = ImagePipeline;
	readonly isAvailable = isImageAvailable;
}
