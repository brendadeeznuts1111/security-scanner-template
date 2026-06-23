import {existsSync, readdirSync} from 'fs';
import path from 'path';
import type {DomainConfig} from '../config/types.ts';
import type {SupplyChainConfig} from '../domains/supply-chain.ts';
import {severityPolicyFromDocument, type PolicyDocument} from '../policy/index.ts';
import {DEFAULT_POLICY_FILE, loadPolicy} from '../policy/loader.ts';
import {supplyChainConfigFromDomain} from './supply-chain-config.ts';

const POLICY_SKIP_DIRS = new Set(['node_modules', 'templates', '.git']);

/**
 * Load project-root `security.policy.toml` when present.
 */
export async function loadRootProjectPolicy(
	root: string = process.cwd(),
): Promise<PolicyDocument | null> {
	const policyPath = path.join(root, DEFAULT_POLICY_FILE);
	if (!(await Bun.file(policyPath).exists())) {
		return null;
	}
	const doc = await loadPolicy(policyPath);
	return Object.keys(doc).length > 0 ? doc : null;
}

/**
 * Existing policy files to watch for hot-reload (root + workspace folders).
 */
export function resolvePolicyWatchPaths(root: string = process.cwd()): string[] {
	const paths: string[] = [];
	const rootPolicy = path.join(root, DEFAULT_POLICY_FILE);
	if (existsSync(rootPolicy)) {
		paths.push(rootPolicy);
	}

	try {
		for (const entry of readdirSync(root, {withFileTypes: true})) {
			if (!entry.isDirectory() || POLICY_SKIP_DIRS.has(entry.name)) {
				continue;
			}
			const workspacePolicy = path.join(root, entry.name, DEFAULT_POLICY_FILE);
			if (existsSync(workspacePolicy)) {
				paths.push(workspacePolicy);
			}
		}
	} catch {
		/* unreadable root */
	}

	return paths;
}

/**
 * Build supply-chain config from a domain, bridging root TOML policy into
 * `policyDocument` and derived fatal/warn severity when TOML is present.
 */
export async function resolveSupplyChainConfig(
	config: DomainConfig,
	root: string = process.cwd(),
	patch: SupplyChainConfig = {},
): Promise<SupplyChainConfig> {
	const base = supplyChainConfigFromDomain(config, patch);
	const policyDocument = patch.policyDocument ?? (await loadRootProjectPolicy(root)) ?? undefined;

	if (!policyDocument) {
		return base;
	}

	return {
		...base,
		policyDocument,
		policy: patch.policy ?? severityPolicyFromDocument(policyDocument),
	};
}
