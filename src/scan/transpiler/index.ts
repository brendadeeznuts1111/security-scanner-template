export type {
	TranspilerRule,
	TranspilerRuleType,
	TranspilerSeverity,
	TranspilerScanConfig,
	TranspilerScanResult,
	TranspilerFileScanResult,
	TranspilerScanReport,
	TranspilerReportFormat,
	ScanBundlesOptions,
} from './types.ts';

export {scanSourceWithRules, scanAST, isScannableSourcePath} from './analyzer.ts';

export {
	DEFAULT_TRANSPILER_RULES,
	loadTranspilerRules,
	loadProjectTranspilerRules,
	resolveTranspilerRules,
} from './rule-engine.ts';

export {
	loadIntegrityManifest,
	verifyFileIntegrity,
	type IntegrityManifest,
	type IntegrityCheckResult,
} from './integrity.ts';

export {
	BundleScanner,
	resolveTranspilerConfig,
	resolveBundleIncludePaths,
	scanDirectory,
	type BundleScannerOptions,
	type ScanDirectoryOptions,
} from './bundle-scanner.ts';

export {
	formatTranspilerReport,
	formatTranspilerReportJson,
	formatTranspilerReportMarkdown,
	formatTranspilerReportHtml,
	hasCriticalFindings,
} from './reporter.ts';
