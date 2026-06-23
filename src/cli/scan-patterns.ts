import {colorize, TERMINAL} from '../color/index.ts';
import type {DomainRegistry} from '../config/registry.ts';
import {domainRegistry} from '../config/registry.ts';
import {applyPatternFixes, formatPatternRemediationLine} from '../intel/pattern-remediation.ts';
import {Service} from '../service/index.ts';

export interface ScanPatternsCliOptions {
	domain: string;
	path?: string;
	root?: string;
	json?: boolean;
	fix?: boolean;
	registry?: DomainRegistry;
}

/** Run policy-driven regex and AST pattern scans against project source. */
export async function runScanPatternsCli(options: ScanPatternsCliOptions): Promise<number> {
	const registry = options.registry ?? domainRegistry;
	const root = options.root ?? registry.root;

	try {
		await registry.ensureDomain(options.domain);
	} catch (error) {
		console.error(
			colorize(
				TERMINAL.scannerFatal,
				`[scan] ${error instanceof Error ? error.message : String(error)}`,
			),
		);
		return 1;
	}
	if (!registry.has(options.domain)) {
		console.error(colorize(TERMINAL.scannerFatal, `[scan] unknown domain: ${options.domain}`));
		return 1;
	}

	const service = new Service(registry, options.domain);
	const report = await service.scanSource({
		path: options.path,
		root,
		remediation: true,
	});

	if (options.json) {
		console.log(JSON.stringify(report, null, 2));
		return report.matches.length === 0 ? 0 : 1;
	}

	if (report.matches.length === 0) {
		console.log(colorize(TERMINAL.scannerOk, '✅ No pattern violations found.'));
		return 0;
	}

	console.error(
		colorize(TERMINAL.scannerWarn, `[scan] ${report.matches.length} pattern violation(s)`),
	);

	for (const match of report.matches) {
		const color =
			match.severity === 'critical' || match.severity === 'high'
				? TERMINAL.scannerFatal
				: TERMINAL.scannerWarn;
		console.error(
			colorize(color, `  ${formatPatternRemediationLine(match).replaceAll('\n', '\n  ')}`),
		);
	}

	if (options.fix) {
		const applied = await applyPatternFixes(root, report.matches);
		for (const result of applied.results) {
			console.error(
				colorize(
					result.ok ? TERMINAL.scannerOk : TERMINAL.scannerWarn,
					`    ${result.ruleId} ${result.file}: ${result.message}`,
				),
			);
		}
	}

	return 1;
}
