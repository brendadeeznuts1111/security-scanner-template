import {applyDefaults} from './defaults.ts';
import {discoverDomainFiles, loadDomainFile} from './loader.ts';
import type {DomainConfig} from './types.ts';

export interface DomainReportContext {
	domain: string;
	path: string;
	config: DomainConfig;
}

/**
 * Resolve which reverse-DNS domain applies to the current project.
 *
 * Precedence: explicit hint → SP_DOMAIN / SECURITY_SCANNER_DOMAIN → sole domains/ file → null.
 */
export async function resolveProjectDomain(
	root = process.cwd(),
	hint?: string,
): Promise<string | null> {
	if (hint?.trim()) {
		return hint.trim();
	}

	const fromEnv = process.env.SP_DOMAIN ?? process.env.SECURITY_SCANNER_DOMAIN;
	if (fromEnv?.trim()) {
		return fromEnv.trim();
	}

	const files = discoverDomainFiles(root);
	if (files.length === 0) {
		return null;
	}

	if (files.length === 1) {
		try {
			const raw = Bun.JSON5.parse(await Bun.file(files[0]!).text()) as {domain?: string};
			return typeof raw.domain === 'string' ? raw.domain : null;
		} catch {
			return null;
		}
	}

	return null;
}

/**
 * Load domain config for report enrichment (colors, operator QR settings).
 */
export async function loadDomainReportContext(
	root = process.cwd(),
	hint?: string,
): Promise<DomainReportContext | null> {
	const domain = await resolveProjectDomain(root, hint);
	if (!domain) {
		return null;
	}

	const files = discoverDomainFiles(root);
	for (const filePath of files) {
		let config: DomainConfig | undefined;
		try {
			const loaded = await loadDomainFile(filePath);
			if (loaded.config.domain === domain) {
				config = loaded.config;
			}
		} catch {
			try {
				const raw = Bun.JSON5.parse(await Bun.file(filePath).text()) as Record<string, unknown>;
				if (raw.domain === domain) {
					config = applyDefaults(raw);
				}
			} catch {
				// try next file
			}
		}

		if (config) {
			return {domain, path: filePath, config};
		}
	}

	return null;
}