/// <reference path="../types/features.d.ts" />

export type FeatureName =
	| 'AUDIT_SQLITE'
	| 'AUDIT_JSONL'
	| 'INTEL_DNS'
	| 'REPORT_MARKDOWN'
	| 'REPORT_HTML'
	| 'CACHE_REDIS'
	| 'FEED_WEBSOCKET'
	| 'SCAN_EXTERNAL'
	| 'DEBUG'
	| 'MOCK_API';

export const ALL_FEATURES: readonly FeatureName[] = [
	'AUDIT_SQLITE',
	'AUDIT_JSONL',
	'INTEL_DNS',
	'REPORT_MARKDOWN',
	'REPORT_HTML',
	'CACHE_REDIS',
	'FEED_WEBSOCKET',
	'SCAN_EXTERNAL',
	'DEBUG',
	'MOCK_API',
] as const;

function resolveInjected(injected: boolean | undefined, fallback = true): boolean {
	return typeof injected === 'boolean' ? injected : fallback;
}

function envOverride(name: FeatureName): boolean | undefined {
	const value = process.env[`FEATURE_${name}`];
	if (value === 'false' || value === '0') return false;
	if (value === 'true' || value === '1') return true;
	return undefined;
}

function resolveFeature(name: FeatureName, injected: boolean | undefined): boolean {
	const env = envOverride(name);
	if (env !== undefined) return env;
	return resolveInjected(injected);
}

function injectedFlag(value: boolean | undefined): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

export const FEATURE_AUDIT_SQLITE = resolveFeature(
	'AUDIT_SQLITE',
	injectedFlag(typeof __FEATURE_AUDIT_SQLITE__ !== 'undefined' ? __FEATURE_AUDIT_SQLITE__ : undefined),
);

export const FEATURE_AUDIT_JSONL = resolveFeature(
	'AUDIT_JSONL',
	injectedFlag(typeof __FEATURE_AUDIT_JSONL__ !== 'undefined' ? __FEATURE_AUDIT_JSONL__ : undefined),
);

export const FEATURE_INTEL_DNS = resolveFeature(
	'INTEL_DNS',
	injectedFlag(typeof __FEATURE_INTEL_DNS__ !== 'undefined' ? __FEATURE_INTEL_DNS__ : undefined),
);

export const FEATURE_REPORT_MARKDOWN = resolveFeature(
	'REPORT_MARKDOWN',
	injectedFlag(
		typeof __FEATURE_REPORT_MARKDOWN__ !== 'undefined' ? __FEATURE_REPORT_MARKDOWN__ : undefined,
	),
);

export const FEATURE_REPORT_HTML = resolveFeature(
	'REPORT_HTML',
	injectedFlag(typeof __FEATURE_REPORT_HTML__ !== 'undefined' ? __FEATURE_REPORT_HTML__ : undefined),
);

export const FEATURE_CACHE_REDIS = resolveFeature(
	'CACHE_REDIS',
	injectedFlag(typeof __FEATURE_CACHE_REDIS__ !== 'undefined' ? __FEATURE_CACHE_REDIS__ : undefined),
);

export const FEATURE_FEED_WEBSOCKET = resolveFeature(
	'FEED_WEBSOCKET',
	injectedFlag(
		typeof __FEATURE_FEED_WEBSOCKET__ !== 'undefined' ? __FEATURE_FEED_WEBSOCKET__ : undefined,
	),
);

export const FEATURE_SCAN_EXTERNAL = resolveFeature(
	'SCAN_EXTERNAL',
	injectedFlag(
		typeof __FEATURE_SCAN_EXTERNAL__ !== 'undefined' ? __FEATURE_SCAN_EXTERNAL__ : undefined,
	),
);

export const FEATURE_DEBUG = resolveFeature(
	'DEBUG',
	injectedFlag(typeof __FEATURE_DEBUG__ !== 'undefined' ? __FEATURE_DEBUG__ : undefined),
);

export const FEATURE_MOCK_API = resolveFeature(
	'MOCK_API',
	injectedFlag(typeof __FEATURE_MOCK_API__ !== 'undefined' ? __FEATURE_MOCK_API__ : undefined),
);

export const FEATURES = {
	AUDIT_SQLITE: FEATURE_AUDIT_SQLITE,
	AUDIT_JSONL: FEATURE_AUDIT_JSONL,
	INTEL_DNS: FEATURE_INTEL_DNS,
	REPORT_MARKDOWN: FEATURE_REPORT_MARKDOWN,
	REPORT_HTML: FEATURE_REPORT_HTML,
	CACHE_REDIS: FEATURE_CACHE_REDIS,
	FEED_WEBSOCKET: FEATURE_FEED_WEBSOCKET,
	SCAN_EXTERNAL: FEATURE_SCAN_EXTERNAL,
	DEBUG: FEATURE_DEBUG,
	MOCK_API: FEATURE_MOCK_API,
} as const;

const INJECTED_DEFINE_KEYS: Record<FeatureName, string> = {
	AUDIT_SQLITE: '__FEATURE_AUDIT_SQLITE__',
	AUDIT_JSONL: '__FEATURE_AUDIT_JSONL__',
	INTEL_DNS: '__FEATURE_INTEL_DNS__',
	REPORT_MARKDOWN: '__FEATURE_REPORT_MARKDOWN__',
	REPORT_HTML: '__FEATURE_REPORT_HTML__',
	CACHE_REDIS: '__FEATURE_CACHE_REDIS__',
	FEED_WEBSOCKET: '__FEATURE_FEED_WEBSOCKET__',
	SCAN_EXTERNAL: '__FEATURE_SCAN_EXTERNAL__',
	DEBUG: '__FEATURE_DEBUG__',
	MOCK_API: '__FEATURE_MOCK_API__',
};

export function buildFeatureArgs(
	enabled: ReadonlySet<FeatureName> | FeatureName[],
): string[] {
	const enabledSet = enabled instanceof Set ? enabled : new Set(enabled);
	const args: string[] = [];

	for (const name of enabledSet) {
		args.push(`--feature=${name}`);
	}

	return args;
}

export function buildDefineArgs(
	enabled: ReadonlySet<FeatureName> | FeatureName[],
): string[] {
	const enabledSet = enabled instanceof Set ? enabled : new Set(enabled);
	const args: string[] = [];

	for (const name of ALL_FEATURES) {
		if (!enabledSet.has(name)) {
			args.push('--define', `${INJECTED_DEFINE_KEYS[name]}=false`);
		}
	}

	return args;
}

export function parseFeatureList(value: string | undefined): FeatureName[] {
	if (!value?.trim()) return [...ALL_FEATURES];

	return value
		.split(',')
		.map(part => part.trim().toUpperCase())
		.filter((part): part is FeatureName => ALL_FEATURES.includes(part as FeatureName));
}