import path from 'path';
import {parseToml} from '../config/toml.ts';
import type {PolicyDocument} from './types.ts';

export const DEFAULT_POLICY_FILE = 'security.policy.toml';

/**
 * Load a single policy document from a TOML file path.
 */
export async function loadPolicy(filePath: string): Promise<PolicyDocument> {
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		return {};
	}

	const text = await file.text();
	if (text.trim().length === 0) {
		return {};
	}

	const parsed = parseToml(text) as PolicyDocument;
	return normalizePolicy(parsed);
}

/**
 * Discover policy files in a project root.
 *
 * Looks for the root `security.policy.toml` and any `security.policy.toml`
 * files directly inside workspace folders (one level deep). Returns an array of
 * absolute paths.
 */
export async function discoverPolicyFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const rootPolicy = path.resolve(root, DEFAULT_POLICY_FILE);

	if (await Bun.file(rootPolicy).exists()) {
		files.push(rootPolicy);
	}

	try {
		const {readdir} = await import('fs/promises');
		const entries = await readdir(root, {withFileTypes: true});
		for (const entry of entries) {
			if (entry.isDirectory()) {
				const workspacePolicy = path.resolve(root, entry.name, DEFAULT_POLICY_FILE);
				if (await Bun.file(workspacePolicy).exists()) {
					files.push(workspacePolicy);
				}
			}
		}
	} catch {
		// If we can't read the root, return only the root policy if it exists.
	}

	return files;
}

/**
 * Load all discovered policy documents from a project root, merged in order.
 */
export async function loadProjectPolicies(root: string): Promise<PolicyDocument> {
	const files = await discoverPolicyFiles(root);
	const docs = await Promise.all(files.map(loadPolicy));

	return docs.reduce((acc, doc) => {
		return {
			default: {...acc.default, ...doc.default},
			override: [...(acc.override ?? []), ...(doc.override ?? [])],
		};
	}, {} as PolicyDocument);
}

function normalizePolicy(parsed: unknown): PolicyDocument {
	if (typeof parsed !== 'object' || parsed === null) {
		return {};
	}

	const doc = parsed as Record<string, unknown>;
	const policy = (doc.policy as Record<string, unknown>) ?? {};

	const default_ = (policy.default as Record<string, unknown>) ?? {};
	const overrides = Array.isArray(policy.override) ? policy.override : [];

	const defaultOut: import('./types.ts').PolicyDefault = {};
	if (Array.isArray(default_.fatal)) defaultOut.fatal = default_.fatal as string[];
	if (Array.isArray(default_.warn)) defaultOut.warn = default_.warn as string[];
	if (Array.isArray(default_.info)) defaultOut.info = default_.info as string[];

	return {
		default: defaultOut,
		override: overrides.map(o => o as import('./types.ts').PolicyRule),
	};
}
