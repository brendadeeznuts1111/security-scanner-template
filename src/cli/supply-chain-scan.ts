import path from 'path';
import {existsSync} from 'fs';
import {DEFAULT_CONFIG} from '../config/defaults.ts';
import type {DomainRegistry} from '../config/registry.ts';
import {domainRegistry} from '../config/registry.ts';
import {DEFAULT_POLICY_FILE, loadPolicy, loadProjectPolicies} from '../policy/loader.ts';
import {scanPolicyConstraints} from '../intel/constraint-checks.ts';
import {
	readProjectDependencyVersions,
} from '../intel/semver-checks.ts';
import {scanPackageSemverViolations} from '../intel/semver-scan.ts';
import {benchmark} from '../utils/benchmark.ts';
import {scanDirectory} from '../scan/transpiler/bundle-scanner.ts';
import type {TranspilerReportFormat} from '../scan/transpiler/types.ts';
import {
	formatSupplyChainScanJson,
	formatSupplyChainScanMarkdown,
	supplyChainScanHasBlockingFindings,
	type SupplyChainDeepScanReport,
} from '../report/supply-chain-report.ts';
import {
	resolveProjectRootFromPath,
	resolveSupplyChainScanPath,
} from './supply-chain-path.ts';
import {
	resolveSupplyChainProfile,
	type SupplyChainScanProfile,
	type SupplyChainScanProfileSpec,
} from './supply-chain-profiles.ts';
import {runTranspilerBundleCli, type TranspilerBundleCliOptions} from './transpiler-bundle.ts';
import {
	resolveScannerPackageRoot,
	resolveSupplyChainScanIdentity,
} from '../intel/scanner-identity.ts';
import {
	planSupplyChainRemediation,
	type SupplyChainRemediationPlan,
} from '../intel/supply-chain-remediation.ts';

export interface SupplyChainDeepScanOptions {
	path: string;
	profile?: string;
	domain?: string;
	rules?: string[];
	format?: TranspilerReportFormat;
	output?: string;
	projectRoot?: string;
	policyPath?: string;
	verifyIntegrity?: boolean;
	threatFeed?: boolean;
	feedUrl?: string;
	transitive?: boolean;
	registry?: DomainRegistry;
	emitFormattedStdout?: boolean;
	/** Include semver remediation suggestions in package layer. */
	remediation?: boolean;
}

async function runBundleLayer(
	scanPath: string,
	profile: SupplyChainScanProfileSpec & {name: SupplyChainScanProfile | 'default'},
	options: SupplyChainDeepScanOptions,
): Promise<{exitCode: number; report: SupplyChainDeepScanReport['bundle']}> {
	const timed = await benchmark('supply-chain.bundle', async () => {
		if (options.domain && options.registry) {
			await options.registry.loadAll();
			if (options.registry.has(options.domain)) {
				const {Service} = await import('../service/index.ts');
				const service = new Service(options.registry, options.domain);
				return service.scanBundles({
					path: scanPath,
					rules: options.rules ?? profile.rules,
					verifyIntegrity: options.verifyIntegrity,
					checkBundleDrift: false,
					includeSemverPolicy: false,
				});
			}
		}
		return scanDirectory({
			root: scanPath,
			ruleIds: options.rules ?? profile.rules,
			verifyIntegrity: options.verifyIntegrity,
			domain: options.domain,
		});
	});
	return {exitCode: 0, report: {...timed.result, durationMs: timed.durationMs}};
}

async function runPolicyLayers(
	projectRoot: string,
	profile: SupplyChainScanProfileSpec,
	options: SupplyChainDeepScanOptions,
): Promise<{packages?: SupplyChainDeepScanReport['packages']; constraints?: SupplyChainDeepScanReport['constraints']; policyPresent: boolean}> {
	const policyPath = options.policyPath ?? path.join(projectRoot, DEFAULT_POLICY_FILE);
	if (!existsSync(policyPath)) {
		return {policyPresent: false, packages: undefined, constraints: undefined};
	}

	const policy = options.policyPath
		? await loadPolicy(path.resolve(options.policyPath))
		: await loadProjectPolicies(projectRoot);
	const installed = await readProjectDependencyVersions(projectRoot);
	const packages = Object.fromEntries(installed.map(pkg => [pkg.name, pkg.version]));

	let packagesReport: SupplyChainDeepScanReport['packages'];
	if (profile.includePackages) {
		const stubConfig = {...DEFAULT_CONFIG, domain: options.domain ?? 'external.project'};
		if (options.domain && options.registry?.has(options.domain)) {
			stubConfig.supplyChain = options.registry.get(options.domain).supplyChain;
		}
		if (options.threatFeed || options.feedUrl) {
			await options.registry?.loadThreatFeed(options.feedUrl, {
				local: stubConfig.supplyChain.feed?.local,
				remote: stubConfig.supplyChain.feed?.remote,
			});
		}
		packagesReport = await scanPackageSemverViolations(packages, {
			root: projectRoot,
			domain: options.domain ?? 'external.project',
			config: stubConfig,
			includeThreatFeed: options.threatFeed === true || !!options.feedUrl,
			includeRemediation: options.remediation !== false,
			deepConstraints: profile.includeConstraints,
			transitive: options.transitive,
			threatEntries:
				options.threatFeed || options.feedUrl
					? options.registry?.getLoadedThreats()
					: undefined,
		});
	}

	let constraintsReport: SupplyChainDeepScanReport['constraints'];
	if (profile.includeConstraints) {
		constraintsReport = await scanPolicyConstraints({
			root: projectRoot,
			policy,
			transitive: options.transitive,
			sourcePath: 'src/',
			scanImports: profile.scanImports,
			domain: options.domain,
		});
	}

	return {
		packages: packagesReport,
		constraints: constraintsReport,
		policyPresent: true,
	};
}

/** Collect a multi-layer supply-chain scan report (no stdout). */
export async function collectSupplyChainDeepScanReport(
	options: SupplyChainDeepScanOptions,
): Promise<SupplyChainDeepScanReport> {
	const started = performance.now();
	const scanPath = resolveSupplyChainScanPath(options.path);
	if (!existsSync(scanPath)) {
		throw new Error(`Path not found: ${options.path}`);
	}

	const profile = resolveSupplyChainProfile(options.profile);
	const registry = options.registry ?? domainRegistry;
	const projectRoot =
		options.projectRoot ??
		resolveProjectRootFromPath(scanPath) ??
		undefined;

	const capturedAt = new Date().toISOString();
	const [bundleLayer, policyLayers, identity] = await Promise.all([
		runBundleLayer(scanPath, profile, {...options, registry}),
		projectRoot && (profile.includePackages || profile.includeConstraints)
			? runPolicyLayers(projectRoot, profile, {...options, registry})
			: Promise.resolve({
					policyPresent: false,
					packages: undefined,
					constraints: undefined,
				}),
		resolveSupplyChainScanIdentity({
			scannerRoot: resolveScannerPackageRoot(import.meta.path),
			projectRoot,
			domain: options.domain,
			registry,
			capturedAt,
		}),
	]);

	const report: SupplyChainDeepScanReport = {
		profile: profile.name,
		projectRoot: projectRoot ?? null,
		bundlePath: scanPath,
		identity,
		bundle: bundleLayer.report,
		packages: policyLayers.packages,
		constraints: policyLayers.constraints,
		policyPresent: policyLayers.policyPresent ?? false,
		durationMs: performance.now() - started,
	};
	report.remediation = planSupplyChainRemediation(report);
	return report;
}

/** Write formatted scan output and operator stderr summary. */
export async function emitSupplyChainDeepScanReport(
	report: SupplyChainDeepScanReport,
	options: SupplyChainDeepScanOptions,
	plan: SupplyChainRemediationPlan = report.remediation ?? planSupplyChainRemediation(report),
): Promise<void> {
	const enriched = {...report, remediation: plan};
	const format = options.format ?? 'json';
	const body =
		format === 'markdown'
			? formatSupplyChainScanMarkdown(enriched)
			: formatSupplyChainScanJson(enriched);

	if (options.output) {
		await Bun.write(options.output, body);
	} else if (options.emitFormattedStdout && (format === 'markdown' || format === 'json')) {
		console.log(body);
	}

	if (format !== 'json' && !options.output) {
		const {colorize, TERMINAL} = await import('../color/index.ts');
		const profile = resolveSupplyChainProfile(options.profile);
		console.error(
			colorize(
				TERMINAL.scannerInfo,
				`[supply-chain] ${report.identity.scanner.name}@${report.identity.scanner.version ?? '0.0.0'} profile=${profile.name} bundle=${report.bundle.findings.length} pkg=${report.packages?.violations.length ?? 0} constraints=${report.constraints?.violations.length ?? 0} queue=${plan.autoFixableCount}a/${plan.manualCount}m (${report.durationMs.toFixed(2)}ms)`,
			),
		);
		if (!report.policyPresent && (profile.includePackages || profile.includeConstraints)) {
			console.error(
				colorize(
					TERMINAL.scannerWarn,
					`[supply-chain] no ${DEFAULT_POLICY_FILE} at ${report.projectRoot ?? report.bundlePath} — skipped package/constraint layers`,
				),
			);
		}
		if (plan.queue.length > 0 && plan.autoFixableCount > 0) {
			console.error(
				colorize(
					TERMINAL.scannerOk,
					`[supply-chain] ${plan.autoFixableCount} auto-fix(es) queued — pass --fix to apply and re-scan`,
				),
			);
		}
	}
}

export async function runSupplyChainDeepScan(
	options: SupplyChainDeepScanOptions,
): Promise<number> {
	const report = await collectSupplyChainDeepScanReport(options);
	await emitSupplyChainDeepScanReport(report, options);
	return supplyChainScanHasBlockingFindings(report) ? 1 : 0;
}

/** Thin wrapper for bundle-only scans (legacy path). */
export async function runSupplyChainBundleScan(
	options: TranspilerBundleCliOptions,
): Promise<number> {
	return runTranspilerBundleCli(options);
}