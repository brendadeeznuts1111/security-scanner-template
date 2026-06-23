/**
 * Thin wrappers around Bun runtime utilities.
 *
 * @see https://bun.com/docs/runtime/utils
 * Source: `oven-sh/bun` → `docs/runtime/utils.mdx`
 */
import {auditBunRuntimeCatalog, type BunRuntimeCatalogAudit} from './bun-runtime-catalog.ts';

export const BUN_UTILS_DOCS_URL = 'https://bun.com/docs/runtime/utils';

export interface BunRuntimeInfo {
	version: string;
	revision: string;
	main: string;
}

export interface BunRuntimeValidation {
	ok: boolean;
	missing: string[];
	info: BunRuntimeInfo;
	wrapperCatalog: BunRuntimeCatalogAudit;
}

const REQUIRED_RUNTIME_APIS = [
	'version',
	'revision',
	'main',
	'sleep',
	'which',
	'randomUUIDv7',
	'deepEquals',
	'escapeHTML',
	'stringWidth',
	'fileURLToPath',
	'pathToFileURL',
	'peek',
	'nanoseconds',
	'stripANSI',
	'wrapAnsi',
	'inspect',
	'color',
	'CSRF',
] as const;

/** `Bun.sleep(ms)` or `Bun.sleep(date)` — async delay. */
export function sleep(ms: number | Date): Promise<void> {
	return Bun.sleep(ms);
}

/** `Bun.sleepSync(ms)` — blocking delay (avoid on the main thread in servers). */
export function sleepSync(ms: number): void {
	Bun.sleepSync(ms);
}

export interface WhichOptions {
	PATH?: string;
	cwd?: string;
}

/** Resolve an executable on `PATH` (`Bun.which`). */
export function which(bin: string, options?: WhichOptions): string | null {
	return options ? Bun.which(bin, options) : Bun.which(bin);
}

/**
 * Snapshot of the active Bun runtime (version, git revision, entrypoint).
 */
export function getRuntimeInfo(): BunRuntimeInfo {
	return {
		version: Bun.version,
		revision: Bun.revision,
		main: Bun.main,
	};
}

/**
 * True when `modulePath` is the program entrypoint (`Bun.main`).
 */
export function isMainModule(modulePath: string = import.meta.path): boolean {
	return modulePath === Bun.main;
}

/**
 * Resolve a `file://` URL or import.meta.url to a filesystem path.
 */
export function filePathFromModuleUrl(url: string | URL): string {
	return Bun.fileURLToPath(url);
}

/**
 * Convert a filesystem path to a `file://` URL.
 */
export function moduleUrlFromPath(filePath: string): URL {
	return Bun.pathToFileURL(filePath);
}

export {deepEquals} from './deep-equal.ts';

export {nanoseconds} from './nanoseconds.ts';
export {peekValue, peekStatus, type PeekStatus} from './peek.ts';
export {escapeHtml, type EscapeHtmlInput} from './escape-html.ts';

function isRuntimeApiAvailable(api: (typeof REQUIRED_RUNTIME_APIS)[number]): boolean {
	if (api === 'CSRF') {
		return typeof Bun.CSRF?.generate === 'function' && typeof Bun.CSRF?.verify === 'function';
	}

	if (api === 'color') {
		return typeof Bun.color === 'function';
	}

	return (Bun as unknown as Record<string, unknown>)[api] !== undefined;
}

/**
 * Verify that required Bun utility APIs are present in the active runtime.
 */
export function validateBunRuntime(): BunRuntimeValidation {
	const missing = REQUIRED_RUNTIME_APIS.filter(api => !isRuntimeApiAvailable(api));
	const wrapperCatalog = auditBunRuntimeCatalog();
	const wrapperMissing = wrapperCatalog.missing.filter(
		api => api !== 'Bun.markdown' && api !== 'Bun.randomUUIDv7',
	);
	return {
		ok: missing.length === 0 && wrapperMissing.length === 0,
		missing: [...missing, ...wrapperMissing],
		info: getRuntimeInfo(),
		wrapperCatalog,
	};
}
