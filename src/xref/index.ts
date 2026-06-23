import {ALL_FEATURES, type FeatureName} from '../features/index.ts';

export type IntegrationLayer =
	| 'runtime'
	| 'config'
	| 'storage'
	| 'intelligence'
	| 'scanning'
	| 'reporting'
	| 'cli';

export interface CrossRefEntry {
	/** Stable identifier, e.g. `bun.terminal`. */
	id: string;
	/** Human-readable label. */
	name: string;
	/** Architectural layer. */
	layer: IntegrationLayer;
	/** Bun runtime API identifier when applicable. */
	bunApi?: string;
	/** Short description of the integration. */
	description: string;
	/** Source modules that implement or consume this API. */
	modules: string[];
	/** Named exports wired to this API. */
	exports?: string[];
	/** Compile-time feature gate, if any. */
	feature?: FeatureName;
	/** Domain config fields that enable/configure this API. */
	configFields?: string[];
	/** CLI entrypoints (`script subcommand`). */
	cliCommands?: string[];
	/** Related cross-ref ids. */
	related?: string[];
	/** Official Bun documentation URL. */
	docsUrl?: string;
	/** Required for core scanner operation. */
	required?: boolean;
}

export interface CrossRefFilters {
	layer?: IntegrationLayer;
	feature?: FeatureName;
	module?: string;
	configField?: string;
	cliCommand?: string;
	bunApi?: string;
	required?: boolean;
}

export interface CrossRefApiStatus {
	id: string;
	name: string;
	available: boolean;
	required: boolean;
	featureEnabled: boolean;
}

export interface CrossRefValidation {
	ok: boolean;
	requiredMissing: string[];
	optionalMissing: string[];
	featureDisabled: string[];
	entries: CrossRefApiStatus[];
}

export const CROSS_REF_CATALOG: readonly CrossRefEntry[] = [
	{
		id: 'bun.spawn',
		name: 'Process spawn',
		layer: 'scanning',
		bunApi: 'Bun.spawn',
		description:
			'Spawn external security tools; await proc.exited and read piped stdout (Bun spawn guide).',
		modules: ['src/scan/tools.ts', 'src/utils/process.ts'],
		exports: ['runTool', 'runAvailableTools', 'spawnChild', 'spawnAndWait', 'spawnStdoutText'],
		cliCommands: ['scan interactive'],
		related: ['bun.terminal', 'utils.process'],
		docsUrl: 'https://bun.com/docs/guides/process/spawn',
		required: true,
	},
	{
		id: 'bun.terminal',
		name: 'PTY terminal',
		layer: 'scanning',
		bunApi: 'Bun.spawn({ terminal })',
		feature: 'SCAN_EXTERNAL',
		description: 'Interactive scanner runs with full TTY (colors, progress bars, prompts).',
		modules: [
			'src/scan/tools.ts',
			'src/scan/terminal.ts',
			'src/scan/shell.ts',
			'src/service/index.ts',
			'src/interactive/shell.ts',
		],
		exports: [
			'ToolRunner',
			'runWithPTY',
			'runInteractive',
			'runInteractiveScanner',
			'SecurityShell',
		],
		configFields: ['service.interactive'],
		cliCommands: ['scan interactive', 'scan bundle', 'scan domains', 'shell'],
		related: ['bun.spawn', 'service.interactive', 'feature.scan-external'],
		docsUrl: 'https://bun.sh/docs/runtime/child-process#terminal-pty-support',
	},
	{
		id: 'utils.process',
		name: 'Spawn & stdio helpers',
		layer: 'runtime',
		bunApi: 'Bun.spawn',
		description:
			'Inherited stdio spawns, TERM env for PTY children, interactive-session guards, pipeline pager diagnostics.',
		modules: [
			'src/utils/process.ts',
			'src/utils/terminal-io.ts',
			'src/scan/terminal.ts',
			'src/scan/shell.ts',
			'src/scan/readline.ts',
		],
		exports: [
			'spawnChild',
			'spawnAndWait',
			'spawnStdoutText',
			'spawnStdoutCaptured',
			'spawnStderrCaptured',
			'readSpawnStdout',
			'readSpawnStderr',
			'spawnInherit',
			'spawnInheritAndExit',
			'requireInteractiveSession',
			'getTerminalIORuntimeInfo',
			'formatRuntimeInfoTable',
			'resolveSpawnStdout',
			'resolveHumanStdout',
			'spawnEnvWithTerm',
			'SPAWN_STDIO_DEFAULTS',
			'SPAWN_BEHAVIOR',
			'formatSpawnBehaviorTable',
			'spawnSyncCaptured',
			'killSpawn',
			'unrefSpawn',
		],
		cliCommands: ['sp shell', 'sp scan', 'scan interactive', 'build', 'sp doctor --json'],
		related: ['bun.spawn', 'bun.terminal', 'utils.signals'],
		docsUrl: 'https://bun.com/docs/runtime/child-process#spawn-a-process-bun-spawn',
	},
	{
		id: 'utils.signals',
		name: 'OS signal handlers',
		layer: 'runtime',
		bunApi: 'process.on',
		description:
			'SIGINT/SIGTERM interrupt handling, Ctrl+C listeners, and beforeExit/exit hooks for long-running CLIs.',
		modules: ['src/utils/signals.ts', 'src/cli/watch.ts', 'src/interactive/shell.ts'],
		exports: [
			'onInterruptSignals',
			'onCtrlC',
			'waitForInterruptSignal',
			'interruptAbortController',
			'onProcessExit',
			'formatSignalBehaviorTable',
			'INTERRUPT_SIGNALS',
			'SIGNAL_BEHAVIOR',
		],
		cliCommands: ['watch', 'shell', 'scan interactive'],
		related: ['utils.process'],
		docsUrl: 'https://bun.com/docs/guides/process/os-signals',
	},
	{
		id: 'utils.doctor-diagnostics',
		name: 'Doctor runtime diagnostics',
		layer: 'runtime',
		bunApi: 'Bun.nanoseconds',
		description:
			'Doctor/CLI diagnostics: Bun.nanoseconds timing, Bun.stringWidth tables, inspect.custom formatters, spawn + signal snapshots.',
		modules: [
			'src/utils/doctor-diagnostics.ts',
			'src/utils/inspect-custom.ts',
			'src/cli/config-doctor.ts',
		],
		exports: [
			'collectDoctorDiagnostics',
			'formatDoctorDiagnosticsTable',
			'formatDoctorDiagnosticsInspect',
			'createDoctorTimingSnapshot',
			'withInspectCustom',
		],
		cliCommands: ['sp doctor', 'sp doctor --json', 'sp doctor --benchmark'],
		related: ['utils.signals', 'utils.process', 'bun.nanoseconds'],
		docsUrl: 'https://bun.com/docs/runtime/utils#bun-nanoseconds',
	},
	{
		id: 'bun.install',
		name: 'Bun install & lockfile',
		layer: 'runtime',
		bunApi: 'bun install',
		description:
			'Platform cpu/os lockfile targets, install backends, peer auto-install, pnpm migration, cache paths.',
		modules: [
			'src/utils/install-runtime.ts',
			'src/supply-chain/peer-meta.ts',
			'src/cli/watch.ts',
			'src/cli/config-doctor.ts',
		],
		exports: [
			'getInstallRuntimeInfo',
			'detectLockfileState',
			'validateInstallTarget',
			'auditInstallState',
			'formatInstallRuntimeTable',
			'formatInstallRuntimeInspect',
			'formatInstallTargetCommand',
			'resolveInstallWatchPaths',
			'installWatchPaths',
			'checkPeerDependenciesMeta',
		],
		cliCommands: [
			'sp doctor',
			'sp doctor --check-peer-meta',
			'sp doctor --install-cpu arm64 --install-os linux',
			'watch',
		],
		related: ['utils.doctor-diagnostics'],
		docsUrl: 'https://bun.sh/docs/cli/install',
	},
	{
		id: 'bun.json5',
		name: 'JSON5 domain configs',
		layer: 'config',
		bunApi: 'Bun.JSON5.parse',
		description:
			'Domain configs (*.security.json5) and vault inventory (.vault/*.inventory.json5) with comments and trailing commas.',
		modules: [
			'src/config/loader.ts',
			'src/config/vault.ts',
			'src/config/registry-watch.ts',
			'src/utils/config-format-runtime.ts',
		],
		exports: [
			'discoverDomainFiles',
			'loadDomainFile',
			'auditConfigFormats',
			'getConfigFormatRuntimeInfo',
			'formatConfigFormatRuntimeTable',
		],
		configFields: ['domain', 'supplyChain.policy'],
		cliCommands: ['sp doctor', 'sp doctor --json', 'watch'],
		related: ['bun.toml', 'utils.doctor-diagnostics', 'domain.policy-bridge'],
		docsUrl: 'https://bun.sh/docs/runtime/json5',
		required: true,
	},
	{
		id: 'bun.toml',
		name: 'TOML policy files',
		layer: 'config',
		bunApi: 'Bun.TOML.parse',
		description:
			'Project security.policy.toml severity defaults and override rules; parsed via config/toml.ts.',
		modules: [
			'src/config/toml.ts',
			'src/policy/loader.ts',
			'src/domain/policy-bridge.ts',
			'src/utils/config-format-runtime.ts',
		],
		exports: [
			'parseToml',
			'loadPolicy',
			'loadRootProjectPolicy',
			'resolveSupplyChainConfig',
			'resolvePolicyWatchPaths',
			'discoverPolicyFiles',
			'auditConfigFormats',
			'getConfigFormatRuntimeInfo',
		],
		configFields: ['supplyChain.policy'],
		cliCommands: ['sp doctor', 'sp doctor --json', 'watch'],
		related: ['bun.json5', 'domain.policy-bridge'],
		docsUrl: 'https://bun.sh/docs/runtime/toml',
		required: true,
	},
	{
		id: 'domain.policy-bridge',
		name: 'TOML policy bridge',
		layer: 'config',
		description:
			'Loads root security.policy.toml into supply-chain activate() as policyDocument with TOML-derived severity; hot-reloads on watch.',
		modules: [
			'src/domain/policy-bridge.ts',
			'src/cli/watch.ts',
			'src/domain/supply-chain-config.ts',
		],
		exports: [
			'loadRootProjectPolicy',
			'resolveSupplyChainConfig',
			'resolvePolicyWatchPaths',
			'supplyChainConfigFromDomain',
		],
		configFields: ['supplyChain.policy', 'supplyChain.enabled'],
		cliCommands: ['watch'],
		related: ['bun.toml', 'bun.json5'],
	},
	{
		id: 'feature.scan-external',
		name: 'External scanner PTY',
		layer: 'scanning',
		feature: 'SCAN_EXTERNAL',
		description: 'Compile-time gate for Bun.Terminal external tool orchestration.',
		modules: ['src/scan/tools.ts', 'src/interactive/shell.ts'],
		exports: ['ToolRunner', 'feature("SCAN_EXTERNAL")'],
		related: ['bun.terminal', 'bun.bundle.features'],
	},
	{
		id: 'feature.debug',
		name: 'Debug diagnostics',
		layer: 'runtime',
		feature: 'DEBUG',
		description: 'Verbose debug logging and diagnostics.',
		modules: ['src/features/index.ts'],
		exports: ['feature("DEBUG")'],
		related: ['bun.bundle.features'],
	},
	{
		id: 'feature.mock-api',
		name: 'Mock API endpoints',
		layer: 'intelligence',
		feature: 'MOCK_API',
		description: 'Mock threat-feed and API endpoints for local development.',
		modules: ['src/features/index.ts'],
		exports: ['feature("MOCK_API")'],
		related: ['bun.bundle.features'],
	},
	{
		id: 'bun.randomUUIDv7',
		name: 'UUID generation',
		layer: 'runtime',
		bunApi: 'Bun.randomUUIDv7',
		docsUrl: 'https://bun.com/docs/guides/util/javascript-uuid',
		description:
			'Monotonic UUID v7 for audit/SQLite keys; v4 via crypto.randomUUID for scratch paths.',
		modules: ['src/utils/uuid.ts', 'src/audit/entry.ts', 'src/domain/snapshot-history.ts'],
		exports: ['randomUUID', 'randomUUIDv7', 'correlationId', 'scratchId'],
		related: ['audit.jsonl', 'audit.sqlite'],
	},
	{
		id: 'bun.which',
		name: 'Executable lookup',
		layer: 'scanning',
		bunApi: 'Bun.which',
		description: 'Detect external scanners on PATH before spawning.',
		modules: ['src/utils/tool-detector.ts', 'src/scan/tools.ts'],
		exports: ['detectTool', 'detectTools', 'which'],
		related: ['bun.spawn'],
		docsUrl: 'https://bun.com/docs/runtime/utils#bun-which',
		required: true,
	},
	{
		id: 'bun.bundle.features',
		name: 'Compile-time feature flags',
		layer: 'runtime',
		bunApi: 'bun:bundle / --define',
		description: 'Lean deployment bundles via compile-time dead-code elimination.',
		modules: ['src/features/index.ts', 'src/cli/build.ts'],
		exports: ['ALL_FEATURES', 'ALL_FEATURES', 'buildFeatureArgs', 'parseFeatureList', 'feature()'],
		cliCommands: ['build:bundle'],
		related: ['feature.audit-sqlite', 'feature.audit-jsonl', 'feature.intel-dns'],
		docsUrl: 'https://bun.com/docs/guides/runtime/build-time-constants',
	},
	{
		id: 'feature.audit-sqlite',
		name: 'SQLite audit backend',
		layer: 'storage',
		feature: 'AUDIT_SQLITE',
		description: 'Encrypted SQLite audit sink for .db/.sqlite paths (fallback backend).',
		modules: [
			'src/audit/factory.ts',
			'src/audit/encrypted-sqlite-sink.ts',
			'src/domain/audit-paths.ts',
			'src/domain/index.ts',
		],
		exports: ['createAuditSink', 'EncryptedSQLiteSink', 'AuditSink'],
		configFields: [
			'audit.sqlite.path',
			'audit.sqlite.masterKey',
			'audit.sqlite.compress',
			'audit.sqlite.compressionFormat',
		],
		cliCommands: ['sp shell audit tail'],
		related: ['feature.audit-jsonl', 'bun.bundle.features'],
	},
	{
		id: 'feature.audit-jsonl',
		name: 'JSONL audit backend',
		layer: 'storage',
		feature: 'AUDIT_JSONL',
		description: 'Per-domain encrypted JSONL audit sink (preferred backend).',
		modules: [
			'src/audit/factory.ts',
			'src/audit/encrypted-jsonl-sink.ts',
			'src/domain/audit-paths.ts',
			'src/domain/audit-display.ts',
			'src/domain/index.ts',
			'src/domain/supply-chain-config.ts',
			'src/interactive/shell.ts',
		],
		exports: [
			'createAuditSink',
			'EncryptedJSONLSink',
			'resolveDomainAuditPath',
			'formatColorizedAuditEntry',
		],
		configFields: [
			'audit.jsonl.path',
			'audit.jsonl.masterKey',
			'audit.jsonl.compress',
			'audit.jsonl.compressionFormat',
		],
		cliCommands: ['sp shell audit tail', 'watch'],
		related: ['feature.audit-sqlite', 'bun.bundle.features'],
	},
	{
		id: 'feature.intel-dns',
		name: 'DNS threat intelligence',
		layer: 'intelligence',
		feature: 'INTEL_DNS',
		description: 'DNS reputation checks for feed hostnames and domain intel config.',
		modules: ['src/intel/dns-threat.ts', 'src/domain/index.ts', 'src/provider/feed.ts'],
		exports: ['DNSThreatChecker', 'inspectFeedUrl'],
		configFields: ['intel.dns.blocklist', 'intel.dns.requireResolution'],
		related: ['bun.bundle.features'],
	},
	{
		id: 'feature.report-markdown',
		name: 'Markdown reports',
		layer: 'reporting',
		feature: 'REPORT_MARKDOWN',
		description: 'Markdown report generation for scan output.',
		modules: ['src/report/index.ts', 'src/report/markdown.ts'],
		exports: ['generateReport', 'generateMarkdownReport'],
		configFields: ['ops.report.format'],
		related: ['bun.bundle.features'],
	},
	{
		id: 'feature.report-html',
		name: 'HTML reports',
		layer: 'reporting',
		feature: 'REPORT_HTML',
		description: 'HTML report generation with theme CSS variables.',
		modules: ['src/report/index.ts', 'src/report/html.ts', 'src/color/index.ts'],
		exports: ['generateReport', 'generateHtmlReport', 'cssVariables'],
		configFields: ['ops.report.format', 'colors'],
		related: ['bun.color', 'bun.bundle.features'],
	},
	{
		id: 'feature.cache-redis',
		name: 'Redis feed cache',
		layer: 'storage',
		feature: 'CACHE_REDIS',
		bunApi: 'Bun.redis',
		description: 'Distributed threat-feed cache when REDIS_URL is set.',
		modules: ['src/provider/cache.ts', 'src/provider/redis-cache.ts'],
		exports: ['getCachedFeed', 'readRedisCacheEntry'],
		related: ['bun.bundle.features'],
	},
	{
		id: 'feature.feed-websocket',
		name: 'WebSocket threat feed',
		layer: 'intelligence',
		feature: 'FEED_WEBSOCKET',
		bunApi: 'WebSocket',
		description: 'Load threat feeds from ws:// or wss:// endpoints.',
		modules: ['src/provider/feed.ts', 'src/provider/feed-websocket.ts'],
		exports: ['loadFeed', 'loadWebSocketFeed'],
		configFields: ['supplyChain.feed.remote'],
		related: ['bun.bundle.features'],
	},
	{
		id: 'bun.csrf',
		name: 'CSRF tokens',
		layer: 'runtime',
		bunApi: 'Bun.CSRF',
		description: 'Stateless and session-bound CSRF via Bun.CSRF.generate/verify.',
		modules: ['src/csrf/guard.ts', 'src/csrf/session-bound.ts', 'src/service/index.ts'],
		exports: ['CSRFGuard', 'generateCsrfToken'],
		configFields: ['csrf.enabled', 'csrf.mode', 'csrf.algorithm', 'csrf.encoding'],
		cliCommands: ['csrf rotate'],
		docsUrl: 'https://bun.com/docs/api/csrf',
		required: true,
	},
	{
		id: 'bun.secrets',
		name: 'OS credential store',
		layer: 'config',
		bunApi: 'Bun.secrets',
		description: 'Per-domain vault secrets and threat-feed API keys.',
		modules: ['src/domains/vault.ts', 'src/config/security.ts', 'src/provider/feed.ts'],
		exports: ['createVaultDomain'],
		configFields: ['secrets.service', 'secrets.inventory'],
		cliCommands: ['vault', 'master-key', 'csrf rotate'],
		docsUrl: 'https://bun.com/docs/runtime/secrets',
		required: true,
	},
	{
		id: 'bun.markdown',
		name: 'Markdown rendering',
		layer: 'runtime',
		bunApi: 'Bun.markdown',
		docsUrl: 'https://bun.com/docs/runtime/markdown',
		description:
			'GFM Markdown → HTML for report summaries; custom render/ANSI/plaintext helpers (unstable API).',
		modules: ['src/markdown/index.ts', 'src/report/html.ts'],
		exports: [
			'markdownToHtml',
			'renderMarkdown',
			'markdownToPlaintext',
			'markdownToAnsi',
			'isMarkdownAvailable',
		],
		related: ['feature.report-html', 'feature.report-markdown', 'bun.color'],
	},
	{
		id: 'bun.color',
		name: 'Terminal colors',
		layer: 'runtime',
		bunApi: 'Bun.color',
		docsUrl: 'https://bun.com/docs/runtime/color',
		description: 'ANSI and CSS color output for CLI, doctor, and HTML reports.',
		modules: ['src/color/index.ts', 'src/cli/formatters.ts', 'src/report/html.ts'],
		exports: [
			'colorize',
			'TERMINAL',
			'cssVariables',
			'isValidConfigColor',
			'toRgbaObject',
			'toRgbObject',
			'toRgbaArray',
			'toRgbArray',
			'toColorNumber',
		],
		configFields: ['colors.primary', 'colors.fatal', 'channels'],
		related: ['feature.report-html'],
		required: true,
	},
	{
		id: 'service.interactive',
		name: 'Interactive service mode',
		layer: 'config',
		description: 'Domain flag enabling PTY-backed external scanner orchestration.',
		modules: ['src/service/index.ts', 'src/cli/scan.ts'],
		configFields: ['service.interactive'],
		cliCommands: ['scan interactive'],
		related: ['bun.terminal'],
	},
	{
		id: 'bun.transpiler',
		name: 'Source transpiler scan',
		layer: 'scanning',
		bunApi: 'Bun.Transpiler',
		description:
			'Transpile and scan JS/TS sources and bun build bundles for obfuscated or injected threats.',
		modules: [
			'src/scan/transpiler.ts',
			'src/scan/transpiler/analyzer.ts',
			'src/scan/transpiler/bundle-scanner.ts',
			'src/scan/transpiler/rule-engine.ts',
			'src/scan/transpiler/reporter.ts',
			'src/scan/transpiler/integrity.ts',
			'src/provider/index.ts',
			'src/build/security-plugin.ts',
		],
		exports: [
			'scanSource',
			'scanBundle',
			'scanBundles',
			'scanDirectory',
			'BundleScanner',
			'scanSourceWithRules',
			'findingsToAdvisories',
		],
		cliCommands: ['scan bundle', 'scan source', 'sp scan bundle'],
		configFields: ['service.scan.transpiler'],
		related: ['bun.bundle.features', 'bun.plugin'],
		docsUrl: 'https://bun.com/docs/api/transpiler',
		required: true,
	},
	{
		id: 'html.rewriter',
		name: 'HTML response scan',
		layer: 'scanning',
		bunApi: 'HTMLRewriter',
		description:
			'Parse HTML threat-feed and report responses for injected scripts and unsafe URLs.',
		modules: ['src/scan/html.ts', 'src/provider/feed.ts'],
		exports: ['scanHtmlResponse'],
		configFields: ['supplyChain.feed.remote'],
		related: ['bun.webview', 'feature.feed-websocket'],
		docsUrl: 'https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/',
	},
	{
		id: 'bun.image',
		name: 'Image pipeline',
		layer: 'reporting',
		bunApi: 'Bun.Image',
		description:
			'Zero-dependency thumbnails, thumbhash placeholders, and report image post-processing.',
		modules: [
			'src/visual/thumb.ts',
			'src/visual/placeholder.ts',
			'src/visual/report-image.ts',
			'src/visual/audit.ts',
			'src/image/badge.ts',
		],
		exports: [
			'ThumbnailGenerator',
			'PlaceholderGenerator',
			'ImageMetadataAnalyzer',
			'ImageSanitizer',
			'ImageConverter',
			'ImagePipeline',
			'ReportImageRenderer',
			'AuditVisualProcessor',
			'writeDomainBadge',
		],
		cliCommands: [
			'visual thumb',
			'visual placeholder',
			'visual inspect',
			'visual sanitize',
			'visual convert',
			'visual pipeline',
			'sp audit thumbnail',
		],
		related: ['bun.webview', 'feature.report-html'],
		docsUrl: 'https://bun.com/docs/api/image',
	},
	{
		id: 'bun.webview',
		name: 'Headless report preview',
		layer: 'reporting',
		bunApi: 'Bun.WebView',
		feature: 'REPORT_HTML',
		description: 'Render HTML security reports in a headless WebView for preview and screenshots.',
		modules: ['src/report/webview.ts', 'src/report/preview.ts', 'src/report/generator.ts'],
		exports: ['previewHtmlReport', 'screenshotHtml', 'isWebViewAvailable'],
		cliCommands: ['report preview', 'report screenshot', 'report security'],
		related: ['feature.report-html', 'html.rewriter', 'scan.web-security'],
		docsUrl: 'https://bun.com/docs/api/webview',
	},
	{
		id: 'bun.workers',
		name: 'Parallel threat matching',
		layer: 'intelligence',
		bunApi: 'Worker',
		description: 'Fan out package threat-feed matching across Workers for large dependency trees.',
		modules: ['src/scan/parallel.ts', 'src/scan/threat-worker.ts', 'src/provider/index.ts'],
		exports: ['matchThreatsParallel'],
		related: ['bun.transpiler'],
		docsUrl: 'https://bun.com/docs/api/workers',
	},
	{
		id: 'bun.peek',
		name: 'Promise peek',
		layer: 'runtime',
		bunApi: 'Bun.peek',
		description: 'Inspect pending promises without await — used in domain security cache.',
		modules: ['src/utils/peek.ts', 'src/config/registry.ts'],
		exports: ['peekValue', 'peekStatus', 'isPeekAvailable'],
		docsUrl: 'https://bun.com/docs/runtime/utils#bun-peek',
	},
	{
		id: 'bun.inspect',
		name: 'Inspect formatting',
		layer: 'runtime',
		bunApi: 'Bun.inspect',
		description: 'Doctor tables, debug output, and inspect.custom formatters.',
		modules: ['src/utils/inspect.ts', 'src/utils/inspect-custom.ts', 'src/utils/doctor-diagnostics.ts'],
		exports: ['formatTable', 'formatValue', 'formatInspectCustom', 'withInspectCustom', 'isInspectAvailable'],
		docsUrl: 'https://bun.com/docs/runtime/utils#bun-inspect',
		related: ['utils.process'],
	},
	{
		id: 'bun.deepEquals',
		name: 'Config structural diff',
		layer: 'config',
		bunApi: 'Bun.deepEquals',
		description: 'Deep equality for config drift detection and test assertions.',
		modules: ['src/utils/deep-equal.ts', 'src/config/drift.ts'],
		exports: ['deepEquals', 'deepEqualsStrict', 'isDeepEqualAvailable'],
		docsUrl: 'https://bun.com/docs/guides/util/deep-equals',
	},
	{
		id: 'bun.escapeHTML',
		name: 'HTML escaping',
		layer: 'runtime',
		bunApi: 'Bun.escapeHTML',
		description: 'Escape dynamic text in HTML reports and advisory tables.',
		modules: ['src/utils/escape-html.ts', 'src/report/safe.ts', 'src/report/generator.ts'],
		exports: ['escapeHtml', 'isEscapeHtmlAvailable'],
		docsUrl: 'https://bun.com/docs/guides/util/escape-html',
		related: ['html.rewriter'],
	},
	{
		id: 'bun.nanoseconds',
		name: 'High-precision timing',
		layer: 'runtime',
		bunApi: 'Bun.nanoseconds',
		description: 'Nanosecond timers for scan, doctor, and mitata microbenchmarks.',
		modules: ['src/utils/nanoseconds.ts', 'src/utils/timing.ts', 'src/utils/benchmark.ts'],
		exports: ['nanoseconds', 'isNanosecondsAvailable', 'createTimer', 'benchmark', 'benchmarkAll'],
		docsUrl: 'https://bun.com/docs/guides/process/nanoseconds',
		related: ['bench.mitata', 'bun.jsc.heapStats'],
		cliCommands: ['bench', 'doctor --benchmark', 'sp bench'],
	},
	{
		id: 'bench.mitata',
		name: 'Mitata microbenchmarks',
		layer: 'cli',
		description:
			'Public mitata suites under bench/ (doctor, field-matrix, domain-load) with BENCHMARK_RUNNER JSON output.',
		modules: ['bench/runner.mjs', 'bench/doctor/bench.mjs', 'src/cli/bench.ts'],
		exports: ['runBenchCli'],
		cliCommands: ['bench', 'sp bench'],
		docsUrl: 'https://bun.sh/docs/project/benchmarking',
		related: ['bun.nanoseconds', 'bun.jsc.heapStats'],
	},
	{
		id: 'bun.jsc.heapStats',
		name: 'JavaScript heap stats',
		layer: 'runtime',
		bunApi: 'bun:jsc.heapStats',
		description:
			'Heap size/object counts attached to benchmark reports and doctor --benchmark JSON.',
		modules: ['src/utils/bench-metadata.ts', 'src/utils/benchmark.ts'],
		exports: ['captureBenchmarkHeapStats', 'collectBenchmarkRunMetadata'],
		docsUrl: 'https://bun.sh/docs/project/benchmarking',
		related: ['bench.mitata', 'bun.nanoseconds'],
	},
	{
		id: 'bun.jsonl',
		name: 'JSONL streaming parse',
		layer: 'intelligence',
		bunApi: 'Bun.JSONL',
		description: 'Stream-parse JSONL threat feeds without loading entire files into memory.',
		modules: ['src/provider/feed-jsonl.ts', 'src/audit/encrypted-jsonl-sink.ts'],
		exports: ['parseJSONLFeed', 'streamJSONLFeed'],
		related: ['feature.audit-jsonl', 'feature.feed-websocket'],
	},
	{
		id: 'bun.plugin',
		name: 'Bundler plugins',
		layer: 'runtime',
		bunApi: 'Bun.plugin',
		description: 'Build-time transpiler scans via createSecurityBuildPlugin().',
		modules: ['src/build/security-plugin.ts', 'src/cli/build.ts'],
		exports: ['createSecurityBuildPlugin'],
		related: ['bun.bundle.features', 'bun.transpiler'],
		docsUrl: 'https://bun.com/docs/bundler/plugins',
	},
	{
		id: 'scan.web-security',
		name: 'Web surface scanner',
		layer: 'scanning',
		description: 'CSP + XSS analysis via HTMLRewriter and optional Bun.WebView rendering.',
		modules: ['src/scan/web-security.ts', 'src/scan/html.ts', 'src/report/webview.ts'],
		exports: ['scanWebSecurity', 'scanHtmlResponse'],
		cliCommands: ['report security'],
		related: ['html.rewriter', 'bun.webview'],
	},
	{
		id: 'scan.domains-parallel',
		name: 'Parallel domain validation',
		layer: 'config',
		bunApi: 'Worker',
		description: 'Fan out domain config doctor checks across Workers.',
		modules: ['src/scan/domain-parallel.ts', 'src/scan/domain-worker.ts'],
		exports: ['checkDomainsParallel'],
		cliCommands: ['scan domains'],
		related: ['bun.workers'],
	},
	{
		id: 'bun.file-system-router',
		name: 'Filesystem API routing',
		layer: 'runtime',
		bunApi: 'Bun.FileSystemRouter',
		description: 'Auto-route /scanners/* service endpoints from filesystem layout.',
		modules: ['src/service/router.ts'],
		exports: ['createScannerRouter', 'isFileSystemRouterAvailable'],
		related: ['service.interactive'],
		docsUrl: 'https://bun.com/docs/api/file-system-router',
	},
] as const;

const catalogById = new Map<string, CrossRefEntry>(
	CROSS_REF_CATALOG.map(entry => [entry.id, entry]),
);

function matchesModule(entry: CrossRefEntry, module: string): boolean {
	const needle = module.replace(/^\.\//, '');
	return entry.modules.some(path => path.includes(needle) || needle.includes(path));
}

function matchesConfigField(entry: CrossRefEntry, field: string): boolean {
	return entry.configFields?.some(path => path === field || field.startsWith(`${path}.`)) ?? false;
}

function matchesCliCommand(entry: CrossRefEntry, command: string): boolean {
	return entry.cliCommands?.some(cmd => cmd === command || cmd.startsWith(`${command} `)) ?? false;
}

/**
 * Look up a single cross-reference entry by id.
 */
export function getCrossRef(id: string): CrossRefEntry | undefined {
	return catalogById.get(id);
}

/**
 * List cross-reference entries with optional filters.
 */
export function listCrossRefs(filters: CrossRefFilters = {}): CrossRefEntry[] {
	return CROSS_REF_CATALOG.filter(entry => {
		if (filters.layer && entry.layer !== filters.layer) return false;
		if (filters.feature && entry.feature !== filters.feature) return false;
		if (filters.module && !matchesModule(entry, filters.module)) return false;
		if (filters.configField && !matchesConfigField(entry, filters.configField)) return false;
		if (filters.cliCommand && !matchesCliCommand(entry, filters.cliCommand)) return false;
		if (filters.bunApi && entry.bunApi !== filters.bunApi) return false;
		if (filters.required !== undefined && Boolean(entry.required) !== filters.required)
			return false;
		return true;
	});
}

/**
 * Entries gated by a compile-time feature flag.
 */
export function getCrossRefsByFeature(feature: FeatureName): CrossRefEntry[] {
	return listCrossRefs({feature});
}

/**
 * Entries belonging to an architectural layer.
 */
export function getCrossRefsByLayer(layer: IntegrationLayer): CrossRefEntry[] {
	return listCrossRefs({layer});
}

/**
 * Entries that touch a source module path.
 */
export function getCrossRefsByModule(module: string): CrossRefEntry[] {
	return listCrossRefs({module});
}

/**
 * Entries configured by a domain config field (`audit.jsonl.path`, `audit.sqlite.path`, etc.).
 */
export function getCrossRefsByConfigField(field: string): CrossRefEntry[] {
	return listCrossRefs({configField: field});
}

/**
 * Entries exposed via a CLI command (`scan interactive`, `build:bundle`, etc.).
 */
export function getCrossRefsByCli(command: string): CrossRefEntry[] {
	return listCrossRefs({cliCommand: command});
}

/**
 * Resolve related cross-reference entries for an id.
 */
export function getRelatedCrossRefs(id: string): CrossRefEntry[] {
	const entry = getCrossRef(id);
	if (!entry?.related?.length) return [];
	return entry.related
		.map(relatedId => getCrossRef(relatedId))
		.filter((related): related is CrossRefEntry => related !== undefined);
}

/**
 * Map feature flags to their cross-reference entries.
 */
export function getFeatureCrossRefMap(): Record<FeatureName, CrossRefEntry[]> {
	const map = {} as Record<FeatureName, CrossRefEntry[]>;
	for (const name of ALL_FEATURES) {
		map[name] = [];
	}

	for (const entry of CROSS_REF_CATALOG) {
		if (entry.feature) {
			map[entry.feature].push(entry);
		}
	}

	return map;
}

function isBunApiAvailable(entry: CrossRefEntry): boolean {
	if (!entry.bunApi) return true;

	switch (entry.bunApi) {
		case 'Bun.CSRF':
			return typeof Bun.CSRF?.generate === 'function' && typeof Bun.CSRF?.verify === 'function';
		case 'Bun.color':
			return typeof Bun.color === 'function';
		case 'Bun.markdown':
			return typeof Bun.markdown?.html === 'function';
		case 'Bun.randomUUIDv7':
			return typeof Bun.randomUUIDv7 === 'function';
		case 'Bun.secrets':
			return typeof Bun.secrets?.get === 'function';
		case 'Bun.redis':
			return typeof Bun.redis?.connect === 'function';
		case 'Bun.spawn({ terminal })':
			return typeof Bun.spawn === 'function';
		case 'Bun.spawn':
			return typeof Bun.spawn === 'function';
		case 'Bun.which':
			return typeof Bun.which === 'function';
		case 'WebSocket':
			return typeof WebSocket === 'function';
		case 'bun:bundle / --define':
			return typeof Bun.spawn === 'function';
		case 'Bun.Transpiler':
			return typeof Bun.Transpiler === 'function';
		case 'Bun.Image':
			return typeof Bun.Image === 'function';
		case 'Bun.WebView':
			return typeof Bun !== 'undefined' && 'WebView' in Bun;
		case 'HTMLRewriter':
			return typeof HTMLRewriter === 'function';
		case 'Worker':
			return typeof Worker === 'function';
		case 'Bun.peek':
			return typeof Bun.peek === 'function';
		case 'Bun.inspect':
			return typeof Bun.inspect === 'function';
		case 'Bun.deepEquals':
			return typeof Bun.deepEquals === 'function';
		case 'Bun.escapeHTML':
			return typeof Bun.escapeHTML === 'function';
		case 'Bun.nanoseconds':
			return typeof Bun.nanoseconds === 'function';
		case 'Bun.JSONL':
			return typeof Bun.JSONL?.parse === 'function';
		case 'Bun.FileSystemRouter':
			return typeof (Bun as {FileSystemRouter?: unknown}).FileSystemRouter === 'function';
		case 'Bun.plugin':
			return typeof Bun.plugin === 'function';
		case 'Bun.JSON5.parse':
			return typeof (Bun as {JSON5?: {parse?: unknown}}).JSON5?.parse === 'function';
		case 'Bun.TOML.parse':
			return typeof (Bun as {TOML?: {parse?: unknown}}).TOML?.parse === 'function';
		case 'bun install':
			return typeof Bun.spawn === 'function';
		default:
			return true;
	}
}

/**
 * Validate Bun APIs referenced by the cross-reference catalog.
 */
export function validateCrossRefApis(): CrossRefValidation {
	const entries: CrossRefApiStatus[] = [];
	const requiredMissing: string[] = [];
	const optionalMissing: string[] = [];
	const featureDisabled: string[] = [];

	for (const entry of CROSS_REF_CATALOG) {
		if (!entry.bunApi && !entry.feature) continue;

		const available = isBunApiAvailable(entry);
		const featureEnabled = true;

		entries.push({
			id: entry.id,
			name: entry.name,
			available,
			required: Boolean(entry.required),
			featureEnabled,
		});

		if (entry.feature && !featureEnabled) {
			featureDisabled.push(entry.id);
		}

		if (!available) {
			if (entry.required) {
				requiredMissing.push(entry.id);
			} else {
				optionalMissing.push(entry.id);
			}
		}
	}

	return {
		ok: requiredMissing.length === 0,
		requiredMissing,
		optionalMissing,
		featureDisabled,
		entries,
	};
}
