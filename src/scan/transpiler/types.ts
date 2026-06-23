export type TranspilerSeverity = 'low' | 'medium' | 'high' | 'critical';

export type TranspilerRuleType = 'regex' | 'ast' | 'import';

export interface TranspilerRule {
	id: string;
	description: string;
	severity: TranspilerSeverity;
	type: TranspilerRuleType;
	/** Regex pattern (regex type) or source substring (ast type). */
	pattern?: string;
	/** Import path substring for import-type rules. */
	importPattern?: string;
	category?: string;
}

export interface TranspilerScanConfig {
	enabled: boolean;
	includePaths: string[];
	excludePatterns: string[];
	rules: string[];
	rulesPath?: string;
	verifyIntegrity: boolean;
}

export interface TranspilerScanResult {
	type: 'transpiler';
	file: string;
	line?: number;
	column?: number;
	ruleId: string;
	severity: TranspilerSeverity;
	message: string;
	snippet?: string;
	hash?: string;
	hashExpected?: string;
	integrityMismatch?: boolean;
	category?: string;
}

export interface TranspilerFileScanResult {
	path: string;
	bytes: number;
	hash: string;
	findings: TranspilerScanResult[];
}

export interface BundleDriftSummary {
	changed: boolean;
	previousHash?: string;
	currentHash: string;
	path?: string;
}

export interface TranspilerSemverViolationSummary {
	package: string;
	version: string;
	ruleId: string;
	severity: string;
	description: string;
}

export interface TranspilerSnapshotCompatibilitySummary {
	ok: boolean;
	snapshotVersion?: string;
	scannerVersion?: string;
	storedScannerVersion?: string;
	message?: string;
	migrationHint?: string;
}

export interface TranspilerScanReport {
	domain?: string;
	root: string;
	scannedFiles: number;
	findings: TranspilerScanResult[];
	files: TranspilerFileScanResult[];
	durationMs?: number;
	/** Aggregate bundle hash written into doctor snapshots (spec §16). */
	bundleSnapshot?: {
		path: string;
		hash: string;
		fileCount: number;
		lastScan: string;
	};
	/** Baseline bundle hash drift when a per-domain snapshot exists. */
	bundleDrift?: BundleDriftSummary;
	/** Installed dependency violations from `[[semver.rule]]` policy. */
	semverViolations?: TranspilerSemverViolationSummary[];
	/** Baseline snapshot scanner/schema compatibility (policy `[snapshot]`). */
	snapshotCompatibility?: TranspilerSnapshotCompatibilitySummary;
}

export type TranspilerReportFormat = 'json' | 'markdown' | 'html';

export interface ScanBundlesOptions {
	path?: string;
	rules?: string[];
	format?: TranspilerReportFormat;
	output?: string;
	verifyIntegrity?: boolean;
	/** Compare scanned bundle hash against on-disk doctor baseline. */
	checkBundleDrift?: boolean;
	/** Include policy semver violations in the report. */
	includeSemverPolicy?: boolean;
	/** Load and check the threat intel feed against installed dependencies. */
	threatFeed?: boolean;
	/** Override threat feed URL (implies `threatFeed` when set). */
	feedUrl?: string;
}
