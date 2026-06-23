import {watch, type FSWatcher} from 'fs';
import path from 'path';
import {loadDomainFile} from './loader.ts';
import type {LoadedDomain} from './types.ts';
export interface DomainWatchEvent {
	type: 'added' | 'changed' | 'removed';
	domain: string;
	path: string;
}

export interface DomainWatchOptions {
	debounceMs?: number;
	onReload?: (event: DomainWatchEvent) => void;
}

const DOMAIN_SUFFIX = '.security.json5';
const DEFAULT_DEBOUNCE_MS = 300;

function isDomainConfigFile(filename: string | null | undefined): boolean {
	return typeof filename === 'string' && filename.endsWith(DOMAIN_SUFFIX);
}

function relativeDomainPath(domainsDir: string, absolutePath: string): string {
	return path.relative(domainsDir, absolutePath);
}

export interface DomainWatchHandle {
	watcher: FSWatcher;
	unwatch(): void;
}

export interface DomainWatchContext {
	readonly root: string;
	readonly domains: Map<string, LoadedDomain>;
	readonly securityCache: Map<string, Promise<unknown>>;
	reloadDomain(filePath: string): Promise<DomainWatchEvent | null>;
}

/**
 * Watch `domains/` recursively and hot-reload `*.security.json5` configs.
 */
export function startDomainWatch(
	context: DomainWatchContext,
	options: DomainWatchOptions = {},
): DomainWatchHandle {
	const domainsDir = path.join(context.root, 'domains');
	const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;

	const pending = new Map<string, ReturnType<typeof setTimeout>>();

	const schedule = (absolutePath: string) => {
		const existing = pending.get(absolutePath);
		if (existing) clearTimeout(existing);

		pending.set(
			absolutePath,
			setTimeout(async () => {
				pending.delete(absolutePath);
				const event = await context.reloadDomain(absolutePath);
				if (event) {
					options.onReload?.(event);
				}
			}, debounceMs),
		);
	};

	const watcher = watch(domainsDir, {recursive: true}, (_event, filename) => {
		if (!filename || !isDomainConfigFile(filename)) return;
		const absolutePath = path.join(domainsDir, filename);
		schedule(absolutePath);
	});

	return {
		watcher,
		unwatch() {
			for (const timeout of pending.values()) {
				clearTimeout(timeout);
			}
			pending.clear();
			watcher.close();
		},
	};
}

export function clearSecurityCacheForDomain(
	securityCache: Map<string, Promise<unknown>>,
	domain: string,
): void {
	for (const key of securityCache.keys()) {
		if (key === domain || key.startsWith(`${domain}:`)) {
			securityCache.delete(key);
		}
	}
}

export async function reloadDomainFile(
	domains: Map<string, LoadedDomain>,
	securityCache: Map<string, Promise<unknown>>,
	filePath: string,
): Promise<DomainWatchEvent | null> {
	const exists = await Bun.file(filePath).exists();
	const previous = [...domains.values()].find(entry => entry.path === filePath);

	if (!exists) {
		if (previous) {
			domains.delete(previous.domain);
			clearSecurityCacheForDomain(securityCache, previous.domain);
			return {type: 'removed', domain: previous.domain, path: filePath};
		}
		return null;
	}

	const loaded = await loadDomainFile(filePath);
	if (previous && previous.domain !== loaded.domain) {
		domains.delete(previous.domain);
		clearSecurityCacheForDomain(securityCache, previous.domain);
	}

	domains.set(loaded.domain, loaded);
	clearSecurityCacheForDomain(securityCache, loaded.domain);

	return {
		type: previous ? 'changed' : 'added',
		domain: loaded.domain,
		path: filePath,
	};
}

export {relativeDomainPath, isDomainConfigFile};
