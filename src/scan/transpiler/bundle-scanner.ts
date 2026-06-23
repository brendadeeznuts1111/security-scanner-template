import {statSync} from 'fs';
import path from 'path';
import {IntegrityHasher} from '../../integrity/hasher.ts';
import type {IntegrityHasher as IntegrityHasherType} from '../../integrity/hasher.ts';
import type {DomainConfig} from '../../config/types.ts';
import {scanSourceWithRules, isScannableSourcePath} from './analyzer.ts';
import {loadIntegrityManifest, verifyFileIntegrity} from './integrity.ts';
import {loadProjectTranspilerRules, resolveTranspilerRules} from './rule-engine.ts';
import {
	findSemverPolicyViolations,
	listInstalledDependencyVersions,
} from '../../intel/semver-checks.ts';
import {loadPolicy} from '../../policy/loader.ts';
import {semverRulesFromDocument} from '../../policy/semver.ts';
import type {
	TranspilerRule,
	TranspilerScanConfig,
	TranspilerScanReport,
	TranspilerFileScanResult,
} from './types.ts';

const DEFAULT_INCLUDE = ['dist/', 'build/', 'node_modules/'];
const DEFAULT_EXCLUDE = ['**/*.min.js', '**/*.map'];

/** When `--path` is already a bundle output dir, scan it directly instead of `dist/dist`. */
export function resolveBundleIncludePaths(root: string): string[] {
	const nested = ['dist', 'build', 'node_modules'].filter(name => {
		try {
			return statSync(path.join(root, name)).isDirectory();
		} catch {
			return false;
		}
	});
	if (nested.length > 0) {
		return nested.map(name => `${name}/`);
	}
	return ['.'];
}

const SOURCE_GLOB = '**/*.{js,mjs,cjs,ts,tsx,jsx}';

export function resolveTranspilerConfig(config: DomainConfig): TranspilerScanConfig {
	const transpiler = config.service?.scan?.transpiler;
	return {
		enabled: transpiler?.enabled ?? true,
		includePaths: transpiler?.includePaths ?? DEFAULT_INCLUDE,
		excludePatterns: transpiler?.excludePatterns ?? DEFAULT_EXCLUDE,
		rules: transpiler?.rules ?? [],
		rulesPath: transpiler?.rulesPath,
		verifyIntegrity: transpiler?.verifyIntegrity ?? false,
	};
}

function matchesExclude(relativePath: string, patterns: readonly string[]): boolean {
	for (const pattern of patterns) {
		if (new Bun.Glob(pattern).match(relativePath)) {
			return true;
		}
	}
	return false;
}

async function collectFiles(
	root: string,
	includePaths: readonly string[],
	excludePatterns: readonly string[],
): Promise<string[]> {
	const files = new Set<string>();

	for (const include of includePaths) {
		const base = path.resolve(root, include);
		let stat: ReturnType<typeof statSync> | undefined;
		try {
			stat = statSync(base);
		} catch {
			continue;
		}

		if (stat.isFile() && isScannableSourcePath(base)) {
			files.add(base);
			continue;
		}

		if (!stat.isDirectory()) continue;

		const glob = new Bun.Glob(SOURCE_GLOB);
		for await (const match of glob.scan({cwd: base, onlyFiles: true})) {
			const absolute = path.join(base, match);
			const relative = path.relative(root, absolute);
			if (matchesExclude(relative, excludePatterns)) continue;
			files.add(absolute);
		}
	}

	return Array.from(files).sort();
}

export interface BundleScannerOptions {
	config: TranspilerScanConfig;
	rules: TranspilerRule[];
	hasher: IntegrityHasherType;
	domain?: string;
	verifyIntegrity?: boolean;
}

export class BundleScanner {
	private readonly config: TranspilerScanConfig;
	private readonly rules: TranspilerRule[];
	private readonly hasher: IntegrityHasherType;
	private readonly domain?: string;
	private readonly verifyIntegrity: boolean;

	constructor(options: BundleScannerOptions) {
		this.config = options.config;
		this.rules = options.rules;
		this.hasher = options.hasher;
		this.domain = options.domain;
		this.verifyIntegrity = options.verifyIntegrity ?? options.config.verifyIntegrity;
	}

	async scanFile(
		filePath: string,
		root: string,
		manifest: Awaited<ReturnType<typeof loadIntegrityManifest>>,
	): Promise<TranspilerFileScanResult> {
		const source = await Bun.file(filePath).text();
		const relative = path.relative(root, filePath);
		const findings = scanSourceWithRules(source, filePath, this.rules, {});

		if (this.verifyIntegrity) {
			const integrity = verifyFileIntegrity(this.hasher, source, relative, manifest, filePath);
			if (integrity.finding) {
				findings.push(integrity.finding);
			}
		}

		const hash = this.hasher.digestSync(source);
		return {
			path: filePath,
			bytes: source.length,
			hash,
			findings,
		};
	}

	async scan(root: string): Promise<TranspilerScanReport> {
		const started = performance.now();
		const manifest = this.verifyIntegrity ? await loadIntegrityManifest(root, this.domain) : null;

		const filePaths = await collectFiles(
			root,
			this.config.includePaths,
			this.config.excludePatterns,
		);
		const files = await Promise.all(
			filePaths.map(filePath => this.scanFile(filePath, root, manifest)),
		);

		return {
			domain: this.domain,
			root,
			scannedFiles: files.length,
			findings: files.flatMap(file => file.findings),
			files,
			durationMs: performance.now() - started,
		};
	}
}

export interface ScanDirectoryOptions {
	root?: string;
	domain?: string;
	config?: TranspilerScanConfig;
	ruleIds?: string[];
	verifyIntegrity?: boolean;
	hasher?: IntegrityHasherType;
}

/** High-level directory scan with rule loading and defaults. */
export async function scanDirectory(
	options: ScanDirectoryOptions = {},
): Promise<TranspilerScanReport> {
	const root = path.resolve(options.root ?? process.cwd());
	const config = options.config ?? {
		enabled: true,
		includePaths: resolveBundleIncludePaths(root),
		excludePatterns: DEFAULT_EXCLUDE,
		rules: [],
		verifyIntegrity: options.verifyIntegrity ?? false,
	};

	if (!config.enabled) {
		return {root, scannedFiles: 0, findings: [], files: []};
	}

	const loaded = await loadProjectTranspilerRules(root, config.rulesPath);
	const rules = resolveTranspilerRules(loaded, options.ruleIds ?? config.rules);
	const hasher = options.hasher ?? new IntegrityHasher();

	const scanner = new BundleScanner({
		config,
		rules,
		hasher,
		domain: options.domain,
		verifyIntegrity: options.verifyIntegrity,
	});

	const report = await scanner.scan(root);
	const policyPath = path.join(root, 'security.policy.toml');
	const policyDoc = await loadPolicy(policyPath);
	const semverRules = semverRulesFromDocument(policyDoc);
	if (semverRules.length > 0) {
		const packages = await listInstalledDependencyVersions(
			root,
			semverRules.map(rule => rule.package),
		);
		for (const {rule, version} of findSemverPolicyViolations(packages, semverRules)) {
			report.findings.push({
				type: 'transpiler',
				file: path.join(root, 'package.json'),
				ruleId: rule.id,
				severity: rule.severity,
				message: `${rule.package}@${version}: ${rule.description}`,
				category: rule.category ?? 'supply-chain',
			});
		}
	}

	return report;
}
