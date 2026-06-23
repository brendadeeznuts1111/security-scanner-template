import path from 'path';
import {loadAllDomains, loadSingleDomain, type LoadedDomain} from './loader.ts';
import {
	reloadDomainFile,
	startDomainWatch,
	type DomainWatchEvent,
	type DomainWatchOptions,
} from './registry-watch.ts';
import {createDomainSecurity, type DomainSecurity} from './security.ts';
import {Service, type RouteHandler, type ServiceOptions} from '../service/index.ts';
import type {PackageSemverViolation} from '../intel/semver-checks.ts';
import type {PatternMatch} from '../scan/patterns/index.ts';
import type {FeedConfig} from '../provider/feed.ts';
import type {ThreatFeedEntry} from '../provider/feed-types.ts';
import {Registry} from '../registry/index.ts';
import {peekValue} from '../utils/peek.ts';
import type {DomainConfig} from './types.ts';

export type {DomainWatchEvent, DomainWatchOptions} from './registry-watch.ts';

export interface DomainRegistry {
	readonly root: string;
	loadAll(): Promise<void>;
	/** Load one domain when absent (avoids decrypting unrelated vault inventories). */
	ensureDomain(domain: string): Promise<void>;
	get(domain: string): DomainConfig;
	has(domain: string): boolean;
	list(): string[];
	security(domain: string, csrfSecret?: string): Promise<DomainSecurity>;
	service(domain: string, route?: RouteHandler, options?: ServiceOptions): Promise<Service>;
	checkPackageVersions(packages: Record<string, string>): Promise<PackageSemverViolation[]>;
	scanPatterns(dir: string, root?: string): Promise<PatternMatch[]>;
	loadThreatFeed(feedUrl?: string, config?: FeedConfig): Promise<void>;
	checkPackageThreats(packageName: string, version: string): ThreatFeedEntry[];
	checkPackagesThreats(packages: Record<string, string>): Map<string, ThreatFeedEntry[]>;
	getLoadedThreats(packageName?: string): ThreatFeedEntry[];
	watch(options?: DomainWatchOptions): void;
	unwatch(): void;
	reloadDomain(filePath: string): Promise<DomainWatchEvent | null>;
}

export function createDomainRegistry(root: string): DomainRegistry {
	const domains = new Map<string, LoadedDomain>();
	const securityCache = new Map<string, Promise<DomainSecurity>>();
	let watchHandle: ReturnType<typeof startDomainWatch> | undefined;

	const utilRegistry = new Registry();

	const registry: DomainRegistry = {
		root,
		async loadAll() {
			domains.clear();
			securityCache.clear();
			const loaded = await loadAllDomains(root);
			for (const d of loaded) {
				domains.set(d.domain, d);
			}
		},
		async ensureDomain(domain: string) {
			if (domains.has(domain)) {
				return;
			}
			const loaded = await loadSingleDomain(root, domain);
			domains.set(loaded.domain, loaded);
		},
		get(domain: string): DomainConfig {
			const loaded = domains.get(domain);
			if (!loaded) {
				throw new Error(`Unknown domain: ${domain}`);
			}
			return loaded.config;
		},
		has(domain: string): boolean {
			return domains.has(domain);
		},
		list(): string[] {
			return Array.from(domains.keys()).sort();
		},
		async security(domain: string, csrfSecret?: string): Promise<DomainSecurity> {
			const loaded = domains.get(domain);
			if (!loaded) {
				throw new Error(`Unknown domain: ${domain}`);
			}

			const cacheKey = `${domain}:${csrfSecret ?? ''}`;
			const cached = securityCache.get(cacheKey);
			if (cached) {
				const peeked = peekValue(cached);
				return peeked instanceof Promise ? peeked : peeked;
			}

			const pending = createDomainSecurity(loaded.config, csrfSecret);
			securityCache.set(cacheKey, pending);
			return pending;
		},
		async service(
			domain: string,
			route?: RouteHandler,
			options?: ServiceOptions,
		): Promise<Service> {
			const loaded = domains.get(domain);
			if (!loaded) {
				throw new Error(`Unknown domain: ${domain}`);
			}

			const service = new Service(registry, domain, route);
			await service.start(options);
			return service;
		},
		watch(options?: DomainWatchOptions) {
			registry.unwatch();
			watchHandle = startDomainWatch(
				{
					root,
					domains,
					securityCache,
					reloadDomain: filePath => registry.reloadDomain(filePath),
				},
				options,
			);
		},
		unwatch() {
			watchHandle?.unwatch();
			watchHandle = undefined;
		},
		async reloadDomain(filePath: string): Promise<DomainWatchEvent | null> {
			const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
			return reloadDomainFile(domains, securityCache, resolved);
		},
		checkPackageVersions(packages: Record<string, string>) {
			return utilRegistry.checkPackageVersions(root, packages);
		},
		scanPatterns(dir: string, projectRoot?: string) {
			return utilRegistry.scanPatterns(projectRoot ?? root, dir);
		},
		loadThreatFeed(feedUrl?: string, config?: FeedConfig) {
			return utilRegistry.loadThreatFeed(feedUrl, config);
		},
		checkPackageThreats(packageName: string, version: string) {
			return utilRegistry.checkPackageThreats(packageName, version);
		},
		checkPackagesThreats(packages: Record<string, string>) {
			return utilRegistry.checkPackagesThreats(packages);
		},
		getLoadedThreats(packageName?: string) {
			return utilRegistry.getLoadedThreats(packageName);
		},
	};

	return registry;
}

export const domainRegistry = createDomainRegistry(process.cwd());
