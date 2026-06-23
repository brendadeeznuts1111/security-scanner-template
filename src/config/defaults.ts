import type {DomainConfig, DomainColors, DomainChannels, SecretEntry} from './types.ts';

export const DEFAULT_COLORS: DomainColors = {
	primary: '#0A84FF',
	secondary: '#30D158',
	fatal: '#FF453A',
	warn: '#FF9500',
	info: '#0A84FF',
	success: '#30D158',
};

export const DEFAULT_CHANNELS: DomainChannels = {
	vault: '#0A84FF',
	identity: '#30D158',
	token: '#FF9500',
	csrf: '#FF453A',
	supplyChain: '#BF5AF2',
	ops: '#8E8E93',
};

export const DEFAULT_CONFIG: Omit<DomainConfig, 'domain'> = {
	colors: DEFAULT_COLORS,
	channels: DEFAULT_CHANNELS,
	secrets: {
		service: 'com.example.service',
		allowUnrestrictedAccess: false,
		inventory: [],
		inventoryFile: undefined,
	},
	identity: {
		algorithm: 'bcrypt',
		minLength: 12,
		requireSpecialChar: true,
	},
	token: {
		algorithm: 'HS256',
		ttlSeconds: 3600,
		issuer: 'com.example.service',
	},
	csrf: {
		enabled: true,
		tokenLength: 32,
	},
	supplyChain: {
		enabled: true,
		feed: {
			cachePath: './.security/threat-cache.json',
			cacheTtl: 3600,
		},
		policy: {
			fatal: ['backdoor', 'botnet', 'token-stealer', 'malware'],
			warn: ['protestware', 'adware', 'deprecated', 'unmaintained'],
		},
	},
	ops: {
		watch: {
			debounceMs: 300,
		},
		report: {
			format: 'markdown',
			output: './.security/reports',
		},
	},
	errorOverrides: {},
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSecretEntry(value: unknown): value is SecretEntry {
	if (!isPlainObject(value)) return false;
	return typeof value.name === 'string';
}

function mergeByKey<T extends Record<string, unknown>>(
	target: T[],
	source: T[],
	key: keyof T,
): T[] {
	const map = new Map(target.map(item => [String(item[key]), item]));
	for (const item of source) {
		map.set(String(item[key]), item);
	}
	return Array.from(map.values());
}

function mergeInventory(target: SecretEntry[], source: unknown): SecretEntry[] {
	if (!Array.isArray(source)) return target;
	const entries = source.filter(isSecretEntry);
	return mergeByKey(
		target as unknown as Record<string, unknown>[],
		entries as unknown as Record<string, unknown>[],
		'name',
	) as unknown as SecretEntry[];
}

function mergeErrorOverrides(
	target: DomainConfig['errorOverrides'],
	source: unknown,
): DomainConfig['errorOverrides'] {
	if (!isPlainObject(source)) return target;
	const result: DomainConfig['errorOverrides'] = {};
	for (const key of new Set([...Object.keys(target), ...Object.keys(source)])) {
		const sourceValue = source[key];
		result[key] = isPlainObject(sourceValue)
			? (sourceValue as DomainConfig['errorOverrides'][string])
			: (target[key] ?? {});
	}
	return result;
}

function mergePolicyArrays(target: string[], source: unknown): string[] {
	if (!Array.isArray(source)) return target;
	return source.filter((item): item is string => typeof item === 'string');
}

/**
 * Deep-merge a source object into a target object. Arrays are replaced by
 * default. Null values in source are ignored so defaults survive.
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: unknown): T {
	if (!isPlainObject(source)) return target;

	const result: Record<string, unknown> = {};
	for (const key of new Set([...Object.keys(target), ...Object.keys(source)])) {
		const targetValue = target[key];
		const sourceValue = source[key];

		if (sourceValue === undefined || sourceValue === null) {
			result[key] = targetValue;
		} else if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
			result[key] = deepMerge(targetValue as Record<string, unknown>, sourceValue);
		} else {
			result[key] = sourceValue;
		}
	}
	return result as T;
}

/**
 * Apply defaults to a partial domain config. The `domain` field is required.
 * Array fields use domain-aware merge semantics:
 * - `secrets.inventory` merges by `name`.
 * - `supplyChain.policy.fatal` and `warn` are replaced.
 * - `errorOverrides` merges by error code.
 */
export function applyDefaults(partial: unknown): DomainConfig {
	if (!isPlainObject(partial) || typeof partial.domain !== 'string') {
		throw new Error('Domain config must have a `domain` string');
	}

	const base = deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, partial);

	const merged = base as unknown as DomainConfig;
	merged.domain = partial.domain;
	merged.secrets.service = partial.domain;

	const partialSecrets = partial as Record<string, unknown>;
	const partialInventory = (partialSecrets.secrets as Record<string, unknown> | undefined)
		?.inventory;
	if (Array.isArray(partialInventory)) {
		merged.secrets.inventory = mergeInventory(DEFAULT_CONFIG.secrets.inventory, partialInventory);
	}

	const partialSupplyChain = partialSecrets.supplyChain as Record<string, unknown> | undefined;
	const partialPolicy = partialSupplyChain?.policy;
	if (isPlainObject(partialPolicy)) {
		merged.supplyChain.policy.fatal = mergePolicyArrays(
			DEFAULT_CONFIG.supplyChain.policy.fatal,
			partialPolicy.fatal,
		);
		merged.supplyChain.policy.warn = mergePolicyArrays(
			DEFAULT_CONFIG.supplyChain.policy.warn,
			partialPolicy.warn,
		);
	}

	if (isPlainObject(partialSecrets.errorOverrides)) {
		merged.errorOverrides = mergeErrorOverrides(
			DEFAULT_CONFIG.errorOverrides,
			partialSecrets.errorOverrides,
		);
	}

	return merged;
}
