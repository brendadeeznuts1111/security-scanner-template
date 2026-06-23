import path from 'path';
import {loadAllDomains, type LoadedDomain} from './loader.ts';
import {
	reloadDomainFile,
	startDomainWatch,
	type DomainWatchEvent,
	type DomainWatchOptions,
} from './registry-watch.ts';
import {createDomainSecurity, type DomainSecurity} from './security.ts';
import {Service, type RouteHandler, type ServiceOptions} from '../service/index.ts';
import {peekValue} from '../utils/runtime.ts';
import type {DomainConfig} from './types.ts';

export type {DomainWatchEvent, DomainWatchOptions} from './registry-watch.ts';

export interface DomainRegistry {
	loadAll(): Promise<void>;
	get(domain: string): DomainConfig;
	has(domain: string): boolean;
	list(): string[];
	security(domain: string, csrfSecret?: string): Promise<DomainSecurity>;
	service(domain: string, route?: RouteHandler, options?: ServiceOptions): Promise<Service>;
	watch(options?: DomainWatchOptions): void;
	unwatch(): void;
	reloadDomain(filePath: string): Promise<DomainWatchEvent | null>;
}

export function createDomainRegistry(root: string): DomainRegistry {
	const domains = new Map<string, LoadedDomain>();
	const securityCache = new Map<string, Promise<DomainSecurity>>();
	let watchHandle: ReturnType<typeof startDomainWatch> | undefined;

	const registry: DomainRegistry = {
		async loadAll() {
			domains.clear();
			securityCache.clear();
			const loaded = await loadAllDomains(root);
			for (const d of loaded) {
				domains.set(d.domain, d);
			}
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
		async service(domain: string, route?: RouteHandler, options?: ServiceOptions): Promise<Service> {
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
			const resolved = path.isAbsolute(filePath)
				? filePath
				: path.resolve(root, filePath);
			return reloadDomainFile(domains, securityCache, resolved);
		},
	};

	return registry;
}

export const domainRegistry = createDomainRegistry(process.cwd());
