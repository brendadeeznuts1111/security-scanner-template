import {loadAllDomains, type LoadedDomain} from './loader.ts';
import type {DomainConfig} from './types.ts';

export interface DomainRegistry {
	loadAll(): Promise<void>;
	get(domain: string): DomainConfig;
	has(domain: string): boolean;
	list(): string[];
}

export function createDomainRegistry(root: string): DomainRegistry {
	const domains = new Map<string, LoadedDomain>();

	return {
		async loadAll() {
			domains.clear();
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
	};
}

export const domainRegistry = createDomainRegistry(process.cwd());
