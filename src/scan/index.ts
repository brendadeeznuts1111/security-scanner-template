export {matchThreats, type ThreatMatch, type MatcherInput} from './matcher.ts';
export {matchThreatsParallel, type ParallelScanOptions} from './parallel.ts';
export {
	scanSource,
	scanBundle,
	scanBundles,
	findingsToAdvisories,
	DEFAULT_SOURCE_PATTERNS,
	type SourceFinding,
	type SourcePattern,
	type SourceSeverity,
	type ScanBundleOptions,
	type ScanBundleResult,
} from './transpiler.ts';
export {
	detectTool,
	detectTools,
	runTool,
	runAvailableTools,
	runInteractiveTool,
	ToolRunner,
	DEFAULT_SECURITY_TOOLS,
	type ToolDetection,
	type ToolRunResult,
	type PtyRunOptions,
	type PtyRunResult,
	type SecurityToolName,
} from './tools.ts';
export {
	attachPty,
	createSpawnTerminalOptions,
	ptyDimensions,
	terminalOutputMode,
	withPtySession,
	writeTerminalOutput,
	type PtyAttachOptions,
	type PtyDimensions,
	type SpawnTerminalOptions,
} from './terminal.ts';
export {scanHtmlResponse, type HtmlFinding} from './html.ts';
export {checkDomainsParallel, type DomainCheckResult, type ParallelDomainScanOptions} from './domain-parallel.ts';
export {
	processWebScreenshot,
	scanWebSecurity,
	type WebSecurityFinding,
	type WebSecurityFindingType,
	type WebSecurityScanOptions,
	type WebSecurityScanResult,
	type WebSecurityScreenshot,
} from './web-security.ts';
