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
