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

export interface WorkflowRunReport {
	domain: string;
	timestamp: string;
	results: ScannerResult[];
	issueCount: number;
	maxSeverity: ScannerIssueSeverity;
	ok: boolean;
	/** Drift vs loaded workflow seed (when seed-before-loop is active). */
	drift?: WorkflowSeedDrift;
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
}
