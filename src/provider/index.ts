import {loadThreatFeed, type FeedConfig} from './feed.ts';
import {applyDryRun, type DryRunOptions} from './dry-run.ts';
import {applyPolicy, type PolicyDocument} from '../policy/index.ts';
import {type AllowlistItem, type ThreatFeedItem} from './validator.ts';
import {
	categorize,
	DEFAULT_POLICY,
	type SeverityPolicy,
	setPolicy,
	getPolicy,
	resetPolicy,
} from './policy.ts';
import {
	findingsToAdvisories,
	matchThreatsParallel,
	runAvailableTools,
	scanBundle,
	scanSource,
	type ParallelScanOptions,
	type ToolRunResult,
} from '../scan/index.ts';

export type {FeedConfig} from './feed.ts';
export type {SeverityPolicy} from './policy.ts';
export {DEFAULT_POLICY, setPolicy, getPolicy, resetPolicy} from './policy.ts';
export {
	ThreatCategorySchema,
	ThreatFeedItemSchema,
	AllowlistItemSchema,
	ThreatFeedDocumentSchema,
	ThreatFeedInputSchema,
	ThreatFeedSchema,
	normalizeThreatFeed,
	type ThreatCategory,
	type ThreatFeedItem,
	type AllowlistItem,
	type ThreatFeedDocument,
} from './validator.ts';

export interface ScanExtensions {
	/** Optional package source code keyed by package name for transpiler scans. */
	sources?: Record<string, string>;
	/** Built bundle paths keyed by package name (bun build output). */
	bundles?: Record<string, string>;
	/** Fan out feed matching across Workers for large dependency trees. */
	parallel?: ParallelScanOptions;
	/** External tool names to detect with Bun.which. */
	externalTools?: string[];
	/** Run detected external tools with Bun.spawn during scan. */
	runExternalTools?: boolean;
}

export interface SecurityScannerProvider {
	version: '1';
	config: FeedConfig;
	scan(input: {
		packages: Bun.Security.Package[];
		extensions?: ScanExtensions;
	}): Promise<Bun.Security.Advisory[]>;
}

export interface ProviderOptions {
	config: FeedConfig;
	policy?: SeverityPolicy;
	dryRun?: boolean;
	policyDocument?: PolicyDocument;
	extensions?: ScanExtensions;
}

export type {DryRunOptions} from './dry-run.ts';
export type {PolicyDocument} from '../policy/index.ts';
export {applyDryRun, countFatal} from './dry-run.ts';

export const scannerCapabilities = {
	version: '1.0.0',
	apiVersion: '1',
	supports: [
		'remote-threat-feed',
		'local-threat-feed',
		'jsonl-streaming-feed',
		'cache-aware-feed',
		'stale-while-revalidate-cache',
		'bun-secrets-auth',
		'zod-validation',
		'allowlist-policy',
		'configurable-policy',
		'project-policy-overrides',
		'dry-run',
		'parallel-worker-scan',
		'transpiler-source-scan',
		'transpiler-bundle-scan',
		'external-tool-orchestration',
		'websocket-threat-feed',
		'redis-distributed-cache',
		'html-response-scanning',
	],
	categories: [
		'protestware',
		'adware',
		'backdoor',
		'malware',
		'botnet',
		'token-stealer',
		'deprecated',
		'unmaintained',
	],
};

function buildAdvisory(
	item: ThreatFeedItem,
	level: 'fatal' | 'warn',
	matchingPackages: Bun.Security.Package[],
	_hashVerified: boolean,
): Bun.Security.Advisory {
	return {
		level,
		package: item.package,
		version: matchingPackages[0]?.version,
		url: item.url,
		description: item.description,
		categories: item.categories,
	};
}

function scanPackageSources(
	packages: Bun.Security.Package[],
	sources: Record<string, string>,
): Bun.Security.Advisory[] {
	const advisories: Bun.Security.Advisory[] = [];

	for (const pkg of packages) {
		const source = sources[pkg.name];
		if (!source) continue;

		const findings = scanSource(source);
		advisories.push(...findingsToAdvisories(pkg.name, pkg.version, findings));
	}

	return advisories;
}

async function scanPackageBundles(
	packages: Bun.Security.Package[],
	bundles: Record<string, string>,
): Promise<Bun.Security.Advisory[]> {
	const advisories: Bun.Security.Advisory[] = [];

	for (const pkg of packages) {
		const bundlePath = bundles[pkg.name];
		if (!bundlePath) continue;

		const result = await scanBundle(bundlePath);
		advisories.push(...findingsToAdvisories(pkg.name, pkg.version, result.findings));
	}

	return advisories;
}

async function maybeRunExternalTools(extensions?: ScanExtensions): Promise<ToolRunResult[]> {
	if (!extensions?.runExternalTools) return [];
	return runAvailableTools(extensions.externalTools);
}

export function createProvider(options: ProviderOptions): SecurityScannerProvider {
	const config = options.config;
	const policy = options.policy ?? DEFAULT_POLICY;
	const dryRun = options.dryRun ?? false;
	const policyRules = options.policyDocument?.override ?? [];
	const defaultExtensions = options.extensions;

	return {
		version: '1',
		config,
		async scan(input: {
			packages: Bun.Security.Package[];
			extensions?: ScanExtensions;
		}): Promise<Bun.Security.Advisory[]> {
			const extensions = input.extensions ?? defaultExtensions;
			const {rules, allowlist} = await loadThreatFeed(config);

			const threats = await matchThreatsParallel(
				input.packages,
				rules,
				allowlist,
				extensions?.parallel,
			);

			const results: Bun.Security.Advisory[] = [];

			for (const {item, matchingPackages} of threats) {
				const level = categorize(item, policy);
				if (!level) continue;
				results.push(buildAdvisory(item, level, matchingPackages, false));
			}

			if (extensions?.sources) {
				results.push(...scanPackageSources(input.packages, extensions.sources));
			}

			if (extensions?.bundles) {
				results.push(...(await scanPackageBundles(input.packages, extensions.bundles)));
			}

			await maybeRunExternalTools(extensions);

			const {filtered} = applyPolicy(results, policyRules);
			return applyDryRun(filtered, {dryRun});
		},
	};
}

export const scanner: Bun.Security.Scanner = createProvider({
	config: {},
});
