export interface ReportAdvisory {
	level: 'fatal' | 'warn' | 'info';
	package: string;
	version?: string;
	url: string | null;
	description: string | null;
	categories: string[];
	cve?: string;
}

export interface ReportOverride {
	package?: string;
	version?: string;
	cve?: string;
	category?: string;
	action: string;
	to?: string;
	reason: string;
}

export interface ReportVisual {
	id: string;
	label?: string;
	imagePath?: string;
	normalizedPath?: string;
	thumbnailPath?: string;
	placeholderDataUrl?: string;
}

/** Operator QR encoding the domain vault master token (sensitive — HTML only). */
export interface ReportOperatorQr {
	domain: string;
	/** PNG data URL for `<img src>` — encodes the vault master token. */
	dataUrl: string;
	label?: string;
	/** Bun.hash cache key hex (no token material). */
	cacheKey?: string;
}

export interface ReportData {
	generatedAt: string;
	project?: string;
	feedSource: string;
	riskScore: number;
	fatalCount: number;
	warnCount: number;
	infoCount: number;
	advisories: ReportAdvisory[];
	overrides: ReportOverride[];
	/** Lazy-loaded screenshots and audit thumbnails for the HTML gallery. */
	visuals?: ReportVisual[];
	/** Domain operator QR for vault pairing (omit from exported JSON reports). */
	operatorQr?: ReportOperatorQr;
	scanDurationMs?: number;
	dryRun: boolean;
}

export type ReportFormat = 'json' | 'markdown' | 'html';

export interface ReportOptions {
	format: ReportFormat;
	since?: Date | number;
	output?: string;
	project?: string;
}
