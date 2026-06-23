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
	BUN_PTY_DOCS_URL,
	createReusableTerminal,
	createSpawnTerminalOptions,
	disposeReusableTerminal,
	ptyDimensions,
	PTY_SPAWN_BEHAVIOR,
	spawnPtyProcess,
	terminalOutputMode,
	withPtySession,
	writeTerminalOutput,
	type CreateSpawnTerminalConfig,
	type PtyAttachOptions,
	type PtyDimensions,
	type PtySpawnOptions,
	type PtySpawnResult,
	type ReusableTerminalOptions,
	type SpawnTerminalOptions,
} from './terminal.ts';
export {canRunInteractive, InteractiveShell, type InteractiveShellOptions} from './shell.ts';
export {canPromptInteractively, confirmPrompt, passwordPrompt, readlinePrompt} from './readline.ts';
export {scanHtmlResponse, type HtmlFinding} from './html.ts';
export {
	checkDomainsParallel,
	type DomainCheckResult,
	type ParallelDomainScanOptions,
} from './domain-parallel.ts';
export {
	processWebScreenshot,
	scanWebSecurity,
	type WebSecurityFinding,
	type WebSecurityFindingType,
	type WebSecurityScanOptions,
	type WebSecurityScanResult,
	type WebSecurityScreenshot,
} from './web-security.ts';
