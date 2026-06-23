export interface AuditImageAnomaly {
	code: string;
	severity: 'warn' | 'info';
	message: string;
	value?: string | number;
}

export interface AuditVisualArtifact {
	/** Path to the full-resolution source image, when stored on disk. */
	imagePath?: string;
	/** WebP-normalized image path (EXIF stripped). */
	normalizedPath?: string;
	/** Path to a generated thumbnail sidecar. */
	thumbnailPath?: string;
	/** Thumbhash data URL for lazy-loaded HTML report previews. */
	placeholderDataUrl?: string;
	/** Metadata anomalies detected during ingest (oversized, unusual format, etc.). */
	anomalies?: AuditImageAnomaly[];
}

export interface AuditEntry {
	id: string;
	package: string;
	version: string;
	requestedRange: string;
	advisories: Array<{
		level: 'fatal' | 'warn' | 'info';
		package: string;
		version: string;
		url: string | null;
		description: string | null;
		categories: string[];
	}>;
	allowed: boolean;
	decidedAt: string;
	/** Optional visual artifacts (screenshots, thumbnails, placeholders). */
	visual?: AuditVisualArtifact;
}

export interface AuditSinkOptions {
	compress?: boolean;
	compressionFormat?: 'gzip' | 'zstd';
}

export interface AuditSink {
	append(entry: AuditEntry): Promise<void>;
	stream(): AsyncGenerator<AuditEntry>;
	readAll(): Promise<AuditEntry[]>;
}
