import type {PatternSeverity} from '../scan/patterns/index.ts';

export type ScannerIssueSeverity = PatternSeverity;
export type ScannerStatus = 'pass' | 'warning' | 'fail';
export type WorkflowOutputFormat = 'table' | 'json' | 'ndjson' | 'herdr';

export interface ScannerIssue {
	severity: ScannerIssueSeverity;
	message: string;
	file?: string;
	line?: number;
	column?: number;
	ruleId?: string;
}

export interface ScannerResult {
	scannerId: string;
	domain: string;
	timestamp: string;
	status: ScannerStatus;
	issues: ScannerIssue[];
	metrics?: Record<string, unknown>;
	error?: string;
}

export type WorkflowSeedScannerState = Record<string, unknown>;

export interface WorkflowSeedDriftEntry {
	expected: WorkflowSeedScannerState;
	actual: WorkflowSeedScannerState;
}

export type WorkflowSeedDrift = Record<string, WorkflowSeedDriftEntry>;

export interface WorkflowBunMetadata {
	version: string;
	revision: string | undefined;
	platform: string;
	isDebug: boolean;
}

export interface WorkflowTlsConfig {
	/** Custom CA certificate(s) — PEM string or path to PEM file. */
	ca?: string | string[];
	/** Client certificate — PEM string or path to PEM file. */
	cert?: string;
	/** Client private key — PEM string or path to PEM file. */
	key?: string;
	/** Reject unauthorized certificates (default: true). */
	rejectUnauthorized?: boolean;
}

export interface WorkflowRunReport {
	domain: string;
	timestamp: string;
	results: ScannerResult[];
	issueCount: number;
	maxSeverity: ScannerIssueSeverity;
	ok: boolean;
	/** Drift vs loaded workflow seed (when seed-before-loop is active). */
	drift?: WorkflowSeedDrift;
	/** Bun runtime metadata captured at report time. */
	bun?: WorkflowBunMetadata;
}

/** Post-scan actions: log, webhook alert, semver fix, Markdown report. */
export interface WorkflowEffectsConfig {
	/** Extra drift/issue logs to stderr (default true). */
	log?: boolean;
	/** Webhook URL for Slack/Discord/etc. notifications. */
	alert?: string;
	/** Attempt semver auto-remediation for high/critical violations. */
	fix?: boolean;
	/** Write Markdown report (`true` → default path, string → custom path). */
	report?: boolean | string;
	/** TLS material for outbound webhook alerts. */
	tls?: WorkflowTlsConfig;
}

export interface WorkflowLoopOptions {
	scanners?: string[];
	watch?: boolean;
	watchPaths?: string[];
	watchDebounceMs?: number;
	interval?: number;
	output?: WorkflowOutputFormat;
	dryRun?: boolean;
	failOnIssue?: boolean;
	failOnSeverity?: ScannerIssueSeverity;
	noColor?: boolean;
	/** TLS scan target hostname (defaults from health / feed URL). */
	tlsHost?: string;
	tlsPort?: number;
	tlsDeep?: boolean;
	/** Pattern scan roots (default: src/, dist/). */
	patternPaths?: string[];
	/** JSON5 seed baseline loaded before the first run. */
	seedPath?: string;
	/** Capture current scanner state to this path after each run. */
	seedWritePath?: string;
	/** Exit non-zero when seed drift is detected. */
	failOnDrift?: boolean;
	/** Drift/issue reaction handlers (alert, fix, report). */
	effects?: WorkflowEffectsConfig;
	/** Directory containing custom `.ts` effect plugins to load at runtime. */
	effectsDir?: string;
	/** TLS material for outbound webhook alerts. */
	tls?: WorkflowTlsConfig;
	/** Include Bun runtime metadata in reports, alerts, and drift (default true). */
	includeBunVersion?: boolean;
}

export interface WorkflowAlertPayload {
	domain: string;
	timestamp: string;
	ok: boolean;
	issueCount: number;
	maxSeverity: ScannerIssueSeverity;
	results: {scanner: string; status: ScannerStatus; issues: number}[];
	drift?: WorkflowSeedDrift;
	bun?: WorkflowBunMetadata;
}

export interface WorkflowFixResult {
	package: string;
	ok: boolean;
	message: string;
}

export interface WorkflowEffectsResult {
	alertSent?: boolean;
	alertError?: string;
	fixes?: WorkflowFixResult[];
	reportPath?: string;
}
