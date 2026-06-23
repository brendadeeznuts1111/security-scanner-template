import {loadFeed, type FeedConfig} from './feed.ts';
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

export interface SecurityScannerProvider {
	version: '1';
	config: FeedConfig;
	scan(input: {packages: Bun.Security.Package[]}): Promise<Bun.Security.Advisory[]>;
}

export interface ProviderOptions {
	config: FeedConfig;
	policy?: SeverityPolicy;
	dryRun?: boolean;
	policyDocument?: PolicyDocument;
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

function isAllowed(pkg: Bun.Security.Package, allowlist: AllowlistItem[]): AllowlistItem | null {
	for (const entry of allowlist) {
		if (entry.package === pkg.name && Bun.semver.satisfies(pkg.version, entry.range)) {
			return entry;
		}
	}
	return null;
}

function findThreats(
	packages: Bun.Security.Package[],
	feed: ThreatFeedItem[],
	allowlist: AllowlistItem[],
): {item: ThreatFeedItem; matchingPackages: Bun.Security.Package[]}[] {
	const result: {item: ThreatFeedItem; matchingPackages: Bun.Security.Package[]}[] = [];

	for (const item of feed) {
		const matchingPackages = packages.filter(
			p =>
				p.name === item.package &&
				Bun.semver.satisfies(p.version, item.range) &&
				!isAllowed(p, allowlist),
		);

		if (matchingPackages.length > 0) {
			result.push({item, matchingPackages});
		}
	}

	return result;
}

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

export function createProvider(options: ProviderOptions): SecurityScannerProvider {
	const config = options.config;
	const policy = options.policy ?? DEFAULT_POLICY;
	const dryRun = options.dryRun ?? false;
	const policyRules = options.policyDocument?.override ?? [];

	return {
		version: '1',
		config,
		async scan(input: {packages: Bun.Security.Package[]}): Promise<Bun.Security.Advisory[]> {
			const {rules, allowlist} = await loadFeed(config);

			const threats = findThreats(input.packages, rules, allowlist);
			const results: Bun.Security.Advisory[] = [];

			for (const {item, matchingPackages} of threats) {
				const level = categorize(item, policy);
				if (!level) continue;
				results.push(buildAdvisory(item, level, matchingPackages, false));
			}

			const {filtered} = applyPolicy(results, policyRules);
			return applyDryRun(filtered, {dryRun});
		},
	};
}

export const scanner: Bun.Security.Scanner = createProvider({
	config: {},
});
