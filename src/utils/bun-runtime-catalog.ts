/**
 * Catalog of Bun API wrappers aligned with official guides and runtime docs.
 * Used by doctor diagnostics, runtime validation, and xref audits.
 */
import {
	BUN_DEEP_EQUALS_DOCS_URL,
	BUN_DEEP_EQUALS_GUIDE_URL,
	isDeepEqualAvailable,
} from './deep-equal.ts';
import {
	BUN_ESCAPE_HTML_DOCS_URL,
	BUN_ESCAPE_HTML_GUIDE_URL,
	isEscapeHtmlAvailable,
} from './escape-html.ts';
import {BUN_INSPECT_DOCS_URL, isInspectAvailable} from './inspect.ts';
import {BUN_MARKDOWN_DOCS_URL, isMarkdownAvailable} from '../markdown/index.ts';
import {
	BUN_NANOSECONDS_DOCS_URL,
	BUN_NANOSECONDS_GUIDE_URL,
	isNanosecondsAvailable,
} from './nanoseconds.ts';
import {BUN_PEEK_DOCS_URL, isPeekAvailable} from './peek.ts';
import {BUN_SPAWN_DOCS_URL, BUN_SPAWN_GUIDE_URL, isSpawnAvailable} from './process.ts';
import {
	BUN_CTRL_C_GUIDE_URL,
	BUN_OS_SIGNALS_GUIDE_URL,
	isSignalHandlingAvailable,
} from './signals.ts';
import {BUN_JSON5_DOCS_URL, isJson5Available} from './json5-config.ts';
import {BUN_TEST_API_REFERENCE_URL, isBunTestAvailable} from './bun-test-catalog.ts';
import {BUN_CREATE_DOCS_URL, isBunCreateArtifactSpecAvailable} from './bun-create-catalog.ts';
import {BUN_INIT_DOCS_URL, isBunInitCatalogAvailable} from '../domain/bun-init-catalog.ts';
import {
	BUN_PM_FILTER_DOCS_URL,
	BUN_RUNTIME_FILTER_DOCS_URL,
	isBunRunFilterAvailable,
} from './bun-run-filter.ts';
import {BUN_UUID_GUIDE_URL, BUN_UUID_V7_DOCS_URL, isUUIDv7Available} from './uuid.ts';

export interface BunRuntimeCatalogEntry {
	id: string;
	bunApi: string;
	module: string;
	guideUrl?: string;
	docsUrl: string;
	exports: readonly string[];
	isAvailable: () => boolean;
}

export interface BunRuntimeCatalogStatus {
	id: string;
	bunApi: string;
	available: boolean;
	guideUrl?: string;
	docsUrl: string;
	module: string;
}

export interface BunRuntimeCatalogAudit {
	ok: boolean;
	entries: BunRuntimeCatalogStatus[];
	missing: string[];
}

export const BUN_RUNTIME_CATALOG: readonly BunRuntimeCatalogEntry[] = [
	{
		id: 'deepEquals',
		bunApi: 'Bun.deepEquals',
		module: 'src/utils/deep-equal.ts',
		guideUrl: BUN_DEEP_EQUALS_GUIDE_URL,
		docsUrl: BUN_DEEP_EQUALS_DOCS_URL,
		exports: ['deepEquals', 'deepEqualsStrict', 'isDeepEqualAvailable'],
		isAvailable: isDeepEqualAvailable,
	},
	{
		id: 'peek',
		bunApi: 'Bun.peek',
		module: 'src/utils/peek.ts',
		docsUrl: BUN_PEEK_DOCS_URL,
		exports: ['peekValue', 'peekStatus', 'isPeekAvailable'],
		isAvailable: isPeekAvailable,
	},
	{
		id: 'inspect',
		bunApi: 'Bun.inspect',
		module: 'src/utils/inspect.ts',
		docsUrl: BUN_INSPECT_DOCS_URL,
		exports: ['formatTable', 'formatValue', 'isInspectAvailable'],
		isAvailable: isInspectAvailable,
	},
	{
		id: 'escapeHTML',
		bunApi: 'Bun.escapeHTML',
		module: 'src/utils/escape-html.ts',
		guideUrl: BUN_ESCAPE_HTML_GUIDE_URL,
		docsUrl: BUN_ESCAPE_HTML_DOCS_URL,
		exports: ['escapeHtml', 'isEscapeHtmlAvailable'],
		isAvailable: isEscapeHtmlAvailable,
	},
	{
		id: 'nanoseconds',
		bunApi: 'Bun.nanoseconds',
		module: 'src/utils/nanoseconds.ts',
		guideUrl: BUN_NANOSECONDS_GUIDE_URL,
		docsUrl: BUN_NANOSECONDS_DOCS_URL,
		exports: ['nanoseconds', 'isNanosecondsAvailable', 'createTimer'],
		isAvailable: isNanosecondsAvailable,
	},
	{
		id: 'spawn',
		bunApi: 'Bun.spawn',
		module: 'src/utils/process.ts',
		guideUrl: BUN_SPAWN_GUIDE_URL,
		docsUrl: BUN_SPAWN_DOCS_URL,
		exports: ['spawnChild', 'spawnCaptured', 'spawnStdoutText', 'isSpawnAvailable'],
		isAvailable: isSpawnAvailable,
	},
	{
		id: 'signals',
		bunApi: 'process.on',
		module: 'src/utils/signals.ts',
		guideUrl: BUN_OS_SIGNALS_GUIDE_URL,
		docsUrl: BUN_CTRL_C_GUIDE_URL,
		exports: ['onInterruptSignals', 'onCtrlC', 'isSignalHandlingAvailable'],
		isAvailable: isSignalHandlingAvailable,
	},
	{
		id: 'uuid',
		bunApi: 'Bun.randomUUIDv7',
		module: 'src/utils/uuid.ts',
		guideUrl: BUN_UUID_GUIDE_URL,
		docsUrl: BUN_UUID_V7_DOCS_URL,
		exports: ['randomUUIDv7', 'correlationId', 'isUUIDv7Available'],
		isAvailable: isUUIDv7Available,
	},
	{
		id: 'markdown',
		bunApi: 'Bun.markdown',
		module: 'src/markdown/index.ts',
		docsUrl: BUN_MARKDOWN_DOCS_URL,
		exports: ['markdownToHtml', 'renderMarkdown', 'isMarkdownAvailable'],
		isAvailable: isMarkdownAvailable,
	},
	{
		id: 'json5',
		bunApi: 'Bun.JSON5.parse',
		module: 'src/utils/json5-config.ts',
		docsUrl: BUN_JSON5_DOCS_URL,
		exports: [
			'parseJson5File',
			'parseJson5Text',
			'stringifyJson5',
			'writeJson5File',
			'isJson5Available',
		],
		isAvailable: isJson5Available,
	},
	{
		id: 'runFilter',
		bunApi: 'bun run --filter',
		module: 'src/utils/bun-run-filter.ts',
		guideUrl: BUN_RUNTIME_FILTER_DOCS_URL,
		docsUrl: BUN_PM_FILTER_DOCS_URL,
		exports: [
			'BUN_RUN_FILTER_FLAGS',
			'filterWorkspacePackages',
			'formatBunRunFilterCommand',
			'discoverWorkspacePackages',
			'matchWorkspaceFilter',
		],
		isAvailable: isBunRunFilterAvailable,
	},
	{
		id: 'bunTest',
		bunApi: 'bun:test',
		module: 'src/utils/bun-test-catalog.ts',
		docsUrl: BUN_TEST_API_REFERENCE_URL,
		exports: [
			'BUN_TEST_API_REFERENCE_URL',
			'BUN_TEST_CATALOG',
			'BUN_TEST_CATALOG_GROUPS',
			'auditBunTestCatalog',
			'getBunTestCatalogEntry',
			'isBunTestAvailable',
		],
		isAvailable: isBunTestAvailable,
	},
	{
		id: 'bunInit',
		bunApi: 'bun init',
		module: 'src/domain/bun-init-catalog.ts',
		guideUrl: BUN_INIT_DOCS_URL,
		docsUrl: BUN_INIT_DOCS_URL,
		exports: [
			'discoverDomainPackageInits',
			'planDomainPackageInit',
			'validateDomainPackageInits',
			'auditDomainPackageInits',
			'formatBunInitCommand',
			'buildDomainPackageJson',
		],
		isAvailable: isBunInitCatalogAvailable,
	},
	{
		id: 'bunCreate',
		bunApi: 'bun create',
		module: 'src/utils/bun-create-catalog.ts',
		guideUrl: BUN_CREATE_DOCS_URL,
		docsUrl: BUN_CREATE_DOCS_URL,
		exports: [
			'BUN_CREATE_ARTIFACT_SPEC',
			'walkArtifactSpecLoop',
			'planArtifactSpecLoop',
			'validateArtifactSpecCatalog',
			'auditBunCreateArtifactSpec',
		],
		isAvailable: isBunCreateArtifactSpecAvailable,
	},
] as const;

/** Audit wrapper availability against the aligned Bun runtime catalog. */
export function auditBunRuntimeCatalog(
	catalog: readonly BunRuntimeCatalogEntry[] = BUN_RUNTIME_CATALOG,
): BunRuntimeCatalogAudit {
	const entries = catalog.map(entry => ({
		id: entry.id,
		bunApi: entry.bunApi,
		available: entry.isAvailable(),
		guideUrl: entry.guideUrl,
		docsUrl: entry.docsUrl,
		module: entry.module,
	}));
	const missing = entries.filter(entry => !entry.available).map(entry => entry.bunApi);
	return {ok: missing.length === 0, entries, missing};
}

export function getBunRuntimeCatalogEntry(id: string): BunRuntimeCatalogEntry | undefined {
	return BUN_RUNTIME_CATALOG.find(entry => entry.id === id);
}

/** Primary docs index for Bun utility wrappers. */
export const BUN_RUNTIME_CATALOG_INDEX_URL = 'https://bun.com/docs/runtime/utils';
