/**
 * Config format separation diagnostics (JSON5 domains / vault, TOML policy).
 * @see https://bun.com/docs/runtime/json5
 * @see https://bun.com/docs/runtime/toml
 */

import {existsSync, readdirSync} from 'fs';
import path from 'path';
import {discoverDomainFiles, loadDomainConfigSurface} from '../config/loader.ts';
import {loadRootProjectPolicy} from '../domain/policy-bridge.ts';
import {DEFAULT_POLICY_FILE, discoverPolicyFiles} from '../policy/loader.ts';
import {severityPolicyFromDocument, type PolicyDocument} from '../policy/index.ts';
import {formatTable} from './inspect.ts';
import {formatInspectCustom, withInspectCustom} from './inspect-custom.ts';
import {BUN_JSON5_DOCS_URL, isJson5Available} from './json5-config.ts';
import {shouldColorize} from './process.ts';

export {BUN_JSON5_DOCS_URL};
export const BUN_TOML_DOCS_URL = 'https://bun.com/docs/runtime/toml';

/** Keep in sync with `intel/network-baseline.ts` — local to avoid import cycles. */
const NETWORK_BASELINE_FILENAME = 'network-baseline.json5';

export const CONFIG_FORMAT_ISSUE_CODES = {
	WRONG_EXTENSION: 'CONFIG_WRONG_EXTENSION',
	POLICY_MISSING: 'CONFIG_POLICY_MISSING',
	POLICY_DRIFT: 'CONFIG_POLICY_DRIFT',
	PARSER_MISMATCH: 'CONFIG_PARSER_MISMATCH',
	VAULT_WRONG_EXTENSION: 'CONFIG_VAULT_WRONG_EXTENSION',
} as const;

/** Canonical format separation matrix. */
export const FORMAT_SEPARATION = [
	{
		configType: 'Domain configs',
		extension: '*.security.json5',
		parser: 'Bun.JSON5.parse',
		usedBy: 'loader.ts, doctor, registry-watch, migrate-vault',
	},
	{
		configType: 'Private vault metadata',
		extension: '.vault/*.inventory.json5',
		parser: 'Bun.JSON5.parse',
		usedBy: 'loader, doctor, migrate-vault',
	},
	{
		configType: 'Network audit baselines',
		extension: `.security/*/${NETWORK_BASELINE_FILENAME}`,
		parser: 'Bun.JSON5.parse',
		usedBy: 'json5-config.ts, intel/network-baseline.ts, network loop',
	},
	{
		configType: 'Policy files',
		extension: '*.policy.toml',
		parser: 'Bun.TOML.parse',
		usedBy: 'config/toml.ts → policy/loader.ts',
	},
	{
		configType: 'Bun project config',
		extension: 'bunfig.toml',
		parser: '(Bun runtime)',
		usedBy: 'Bun CLI — not parsed in application code',
	},
] as const;

export const CONFIG_FORMAT_BEHAVIOR = {
	json5Domains:
		'domains/*.security.json5 — comments, unquoted keys, trailing commas via Bun.JSON5.parse',
	vaultInventory: '.vault/<domain>.inventory.json5 — private secret metadata (JSON5)',
	networkBaseline: `.security/<domain>/${NETWORK_BASELINE_FILENAME} — endpoint/health snapshots (JSON5)`,
	tomlPolicy: 'security.policy.toml — severity defaults and override rules via Bun.TOML.parse',
	noBunTomlParse: 'There is no bun.toml.parse — use Bun.TOML.parse and Bun.JSON5.parse',
	bunfigNote: 'bunfig.toml is read by Bun itself; this runtime never parses it',
	policyDrift:
		'When both TOML policy and domain supplyChain.policy exist, fatal/warn arrays should match',
} as const;

export interface ConfigFormatAuditFinding {
	field: string;
	message: string;
	severity: 'error' | 'warning';
	code?: string;
	path?: string;
}

export interface InvalidConfigFile {
	path: string;
	kind: 'domain' | 'vault' | 'policy' | 'unknown';
	expectedExtension: string;
	expectedParser: string;
}

export interface PolicyDriftEntry {
	domain: string;
	path: string;
	domainFatal: string[];
	domainWarn: string[];
	tomlFatal: string[];
	tomlWarn: string[];
}

export interface ConfigFormatRuntimeInfo {
	root: string;
	domainCount: number;
	domainFiles: string[];
	vaultCount: number;
	vaultFiles: string[];
	baselineCount: number;
	baselineFiles: string[];
	policyCount: number;
	policyFiles: string[];
	/** Project-root `security.policy.toml` (not template copies in subfolders). */
	rootPolicyPresent: boolean;
	invalidFiles: InvalidConfigFile[];
	bunfigPresent: boolean;
	policyLoaded: boolean;
	policyDrift: PolicyDriftEntry[];
	json5Available: boolean;
	tomlAvailable: boolean;
	docsUrl: {json5: string; toml: string};
}

function sortedUnique(values: string[]): string[] {
	return [...new Set(values)].sort();
}

function arraysEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	const left = sortedUnique(a);
	const right = sortedUnique(b);
	return left.every((value, index) => value === right[index]);
}

function isTomlAvailable(): boolean {
	return typeof (Bun as {TOML?: {parse?: unknown}}).TOML?.parse === 'function';
}

function listVaultDir(root: string): string[] {
	const vaultDir = path.join(root, '.vault');
	if (!existsSync(vaultDir)) {
		return [];
	}
	return readdirSync(vaultDir).map(name => path.join(vaultDir, name));
}

/** Discover valid `.vault/*.inventory.json5` files under a project root. */
export function discoverVaultFiles(root: string): string[] {
	return listVaultDir(root).filter(filePath => filePath.endsWith('.inventory.json5'));
}

/** Discover network-baseline.json5 files under `.security/` (recursive). */
export function discoverNetworkBaselineFiles(root: string): string[] {
	const securityDir = path.join(root, '.security');
	if (!existsSync(securityDir)) {
		return [];
	}
	const glob = new Bun.Glob(`**/${NETWORK_BASELINE_FILENAME}`);
	const files: string[] = [];
	for (const relative of glob.scanSync({cwd: securityDir, absolute: false})) {
		files.push(path.join(securityDir, relative));
	}
	return files.sort();
}

const INVALID_CONFIG_GLOBS: Array<{
	pattern: string;
	kind: InvalidConfigFile['kind'];
	expectedExtension: string;
	expectedParser: string;
}> = [
	{
		pattern: 'domains/*.security.json',
		kind: 'domain',
		expectedExtension: '.security.json5',
		expectedParser: 'Bun.JSON5.parse',
	},
	{
		pattern: 'domains/*.security.jsonc',
		kind: 'domain',
		expectedExtension: '.security.json5',
		expectedParser: 'Bun.JSON5.parse',
	},
	{
		pattern: 'domains/*.json5',
		kind: 'domain',
		expectedExtension: '.security.json5',
		expectedParser: 'Bun.JSON5.parse',
	},

	{
		pattern: '**/*.policy.json5',
		kind: 'policy',
		expectedExtension: '.policy.toml',
		expectedParser: 'Bun.TOML.parse',
	},
	{
		pattern: '**/*.policy.json',
		kind: 'policy',
		expectedExtension: '.policy.toml',
		expectedParser: 'Bun.TOML.parse',
	},
	{
		pattern: 'security.policy.json5',
		kind: 'policy',
		expectedExtension: 'security.policy.toml',
		expectedParser: 'Bun.TOML.parse',
	},
];

function isProjectScopedPath(root: string, filePath: string): boolean {
	const rel = path.relative(root, filePath);
	if (rel.startsWith('node_modules') || rel.includes(`${path.sep}node_modules${path.sep}`)) {
		return false;
	}
	return true;
}

/** Scan for config files with extensions that violate the format matrix. */
export function discoverInvalidConfigFiles(root: string): InvalidConfigFile[] {
	const invalid: InvalidConfigFile[] = [];
	const seen = new Set<string>();

	for (const spec of INVALID_CONFIG_GLOBS) {
		const glob = new Bun.Glob(spec.pattern);
		for (const filePath of glob.scanSync({cwd: root, absolute: true})) {
			if (!isProjectScopedPath(root, filePath)) {
				continue;
			}
			if (spec.kind === 'domain' && filePath.endsWith('.security.json5')) {
				continue;
			}
			if (seen.has(filePath)) continue;
			seen.add(filePath);
			invalid.push({
				path: filePath,
				kind: spec.kind,
				expectedExtension: spec.expectedExtension,
				expectedParser: spec.expectedParser,
			});
		}
	}

	for (const filePath of listVaultDir(root)) {
		if (filePath.endsWith('.inventory.json5')) {
			continue;
		}
		if (filePath.endsWith('.inventory.json') || filePath.endsWith('.inventory.jsonc')) {
			if (seen.has(filePath)) continue;
			seen.add(filePath);
			invalid.push({
				path: filePath,
				kind: 'vault',
				expectedExtension: '.inventory.json5',
				expectedParser: 'Bun.JSON5.parse',
			});
		}
	}

	return invalid;
}

/** Compare domain JSON5 policy with merged TOML policy defaults. */
export async function detectPolicyDrift(
	domainFiles: string[],
	policyDocument: PolicyDocument | null,
): Promise<PolicyDriftEntry[]> {
	if (!policyDocument?.default) {
		return [];
	}

	const tomlPolicy = severityPolicyFromDocument(policyDocument);
	const drifts: PolicyDriftEntry[] = [];

	for (const filePath of domainFiles) {
		const config = await loadDomainConfigSurface(filePath);
		const domainFatal = config.supplyChain.policy.fatal;
		const domainWarn = config.supplyChain.policy.warn;

		if (!arraysEqual(domainFatal, tomlPolicy.fatal) || !arraysEqual(domainWarn, tomlPolicy.warn)) {
			drifts.push({
				domain: config.domain,
				path: filePath,
				domainFatal,
				domainWarn,
				tomlFatal: tomlPolicy.fatal,
				tomlWarn: tomlPolicy.warn,
			});
		}
	}

	return drifts;
}

/** Doctor findings for config format / parser separation. */
export function auditConfigFormats(info: ConfigFormatRuntimeInfo): ConfigFormatAuditFinding[] {
	const findings: ConfigFormatAuditFinding[] = [];

	if (!info.json5Available) {
		findings.push({
			field: 'config.json5',
			message: 'Bun.JSON5.parse is unavailable — domain configs cannot load',
			severity: 'error',
			code: CONFIG_FORMAT_ISSUE_CODES.PARSER_MISMATCH,
		});
	}

	if (!info.tomlAvailable) {
		findings.push({
			field: 'config.toml',
			message: 'Bun.TOML.parse is unavailable — policy files cannot load',
			severity: 'error',
			code: CONFIG_FORMAT_ISSUE_CODES.PARSER_MISMATCH,
		});
	}

	for (const invalid of info.invalidFiles) {
		const rel = path.relative(info.root, invalid.path) || invalid.path;
		findings.push({
			field: `config.${invalid.kind}`,
			path: invalid.path,
			message: `${rel} uses wrong extension — rename to *${invalid.expectedExtension} and parse with ${invalid.expectedParser}`,
			severity: 'error',
			code:
				invalid.kind === 'vault'
					? CONFIG_FORMAT_ISSUE_CODES.VAULT_WRONG_EXTENSION
					: CONFIG_FORMAT_ISSUE_CODES.WRONG_EXTENSION,
		});
	}

	if (info.domainCount > 0 && !info.rootPolicyPresent) {
		findings.push({
			field: 'config.policy',
			message: `No root ${DEFAULT_POLICY_FILE} found — domain supplyChain.policy in JSON5 only; copy templates/security.policy.toml to project root`,
			severity: 'warning',
			code: CONFIG_FORMAT_ISSUE_CODES.POLICY_MISSING,
		});
	}

	for (const drift of info.policyDrift) {
		findings.push({
			field: 'supplyChain.policy',
			path: drift.path,
			message: `${drift.domain}: supplyChain.policy fatal/warn differs from ${DEFAULT_POLICY_FILE} — reconcile JSON5 and TOML sources`,
			severity: 'warning',
			code: CONFIG_FORMAT_ISSUE_CODES.POLICY_DRIFT,
		});
	}

	return findings;
}

/** Snapshot config format state for doctor output. */
export async function getConfigFormatRuntimeInfo(
	root: string = process.cwd(),
): Promise<ConfigFormatRuntimeInfo> {
	const domainFiles = discoverDomainFiles(root);
	const vaultFiles = discoverVaultFiles(root);
	const baselineFiles = discoverNetworkBaselineFiles(root);
	const policyFiles = await discoverPolicyFiles(root);
	const invalidFiles = discoverInvalidConfigFiles(root);
	const bunfigPresent = await Bun.file(path.join(root, 'bunfig.toml')).exists();
	const policyDocument = await loadRootProjectPolicy(root);
	const rootPolicyPresent = policyDocument !== null;

	const policyDrift = await detectPolicyDrift(domainFiles, policyDocument);

	return {
		root,
		domainCount: domainFiles.length,
		domainFiles,
		vaultCount: vaultFiles.length,
		vaultFiles,
		baselineCount: baselineFiles.length,
		baselineFiles,
		policyCount: policyFiles.length,
		policyFiles,
		rootPolicyPresent,
		invalidFiles,
		bunfigPresent,
		policyLoaded: policyDocument !== null && Object.keys(policyDocument).length > 0,
		policyDrift,
		json5Available: isJson5Available(),
		tomlAvailable: isTomlAvailable(),
		docsUrl: {json5: BUN_JSON5_DOCS_URL, toml: BUN_TOML_DOCS_URL},
	};
}

/** Bun.inspect.table of config format runtime for doctor output. */
export function formatConfigFormatRuntimeTable(info: ConfigFormatRuntimeInfo): string {
	const rows = [
		{area: 'domain', key: 'count', value: String(info.domainCount)},
		{area: 'domain', key: 'parser', value: 'Bun.JSON5.parse'},
		{area: 'domain', key: 'glob', value: 'domains/*.security.json5'},
		{area: 'vault', key: 'count', value: String(info.vaultCount)},
		{area: 'vault', key: 'parser', value: 'Bun.JSON5.parse'},
		{area: 'vault', key: 'glob', value: '.vault/*.inventory.json5'},
		{area: 'baseline', key: 'count', value: String(info.baselineCount)},
		{area: 'baseline', key: 'parser', value: 'Bun.JSON5.parse'},
		{area: 'baseline', key: 'glob', value: `.security/*/${NETWORK_BASELINE_FILENAME}`},
		{area: 'policy', key: 'count', value: String(info.policyCount)},
		{area: 'policy', key: 'parser', value: 'Bun.TOML.parse'},
		{area: 'policy', key: 'root', value: info.rootPolicyPresent ? 'yes' : 'no'},
		{area: 'policy', key: 'file', value: DEFAULT_POLICY_FILE},
		{area: 'invalid', key: 'count', value: String(info.invalidFiles.length)},
		{area: 'drift', key: 'domains', value: String(info.policyDrift.length)},
		{area: 'bunfig', key: 'present', value: info.bunfigPresent ? 'yes (Bun runtime)' : 'no'},
		{area: 'api', key: 'json5', value: info.json5Available ? 'yes' : 'no'},
		{area: 'api', key: 'toml', value: info.tomlAvailable ? 'yes' : 'no'},
	];

	return formatTable(rows, ['area', 'key', 'value'], {colors: shouldColorize(process.stderr)});
}

/** Operator table of format separation notes. */
export function formatConfigFormatBehaviorTable(): string {
	return formatTable(
		[
			{topic: 'domains', note: CONFIG_FORMAT_BEHAVIOR.json5Domains},
			{topic: 'vault', note: CONFIG_FORMAT_BEHAVIOR.vaultInventory},
			{topic: 'baseline', note: CONFIG_FORMAT_BEHAVIOR.networkBaseline},
			{topic: 'policy', note: CONFIG_FORMAT_BEHAVIOR.tomlPolicy},
			{topic: 'parsers', note: CONFIG_FORMAT_BEHAVIOR.noBunTomlParse},
			{topic: 'bunfig', note: CONFIG_FORMAT_BEHAVIOR.bunfigNote},
			{topic: 'drift', note: CONFIG_FORMAT_BEHAVIOR.policyDrift},
		],
		['topic', 'note'],
		{colors: shouldColorize(process.stderr)},
	);
}

export type ConfigFormatRuntimeInspectable = ConfigFormatRuntimeInfo & Record<symbol, unknown>;

export function configFormatRuntimeInspectable(
	info: ConfigFormatRuntimeInfo,
): ConfigFormatRuntimeInspectable {
	return withInspectCustom(info, depth => {
		if (depth < 0) {
			return '[ConfigFormatRuntimeInfo]';
		}
		return formatConfigFormatRuntimeTable(info);
	}) as ConfigFormatRuntimeInspectable;
}

export function formatConfigFormatRuntimeInspect(info: ConfigFormatRuntimeInfo): string {
	return formatInspectCustom(configFormatRuntimeInspectable(info));
}
