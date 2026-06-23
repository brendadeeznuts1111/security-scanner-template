export interface BunRuntimeInfo {
	version: string;
	revision: string;
	main: string;
}

export interface BunRuntimeValidation {
	ok: boolean;
	missing: string[];
	info: BunRuntimeInfo;
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

/**
 * Deep structural equality check (used by bun:test expect().toEqual()).
 */
export function deepEquals(a: unknown, b: unknown, strict = false): boolean {
	return Bun.deepEquals(a, b, strict);
}

/**
 * High-resolution monotonic timer in nanoseconds since process start.
 */
export function nanoseconds(): number {
	return Bun.nanoseconds();
}

export type PeekStatus = 'pending' | 'fulfilled' | 'rejected';

/**
 * Read a settled promise without awaiting; returns the value, error, or the
 * pending promise itself when not yet settled.
 */
export function peekValue<T>(promise: Promise<T>): T | Promise<T> {
	return Bun.peek(promise);
}

/**
 * Read promise settlement status without resolving it.
 */
export function peekStatus<T>(promise: Promise<T>): PeekStatus {
	return Bun.peek.status(promise);
}

/**
 * Escape dynamic text for safe HTML embedding.
 */
export function escapeHtml(text: string): string {
	return Bun.escapeHTML(text);
}

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
	return {
		ok: missing.length === 0,
		missing: [...missing],
		info: getRuntimeInfo(),
	};
}
