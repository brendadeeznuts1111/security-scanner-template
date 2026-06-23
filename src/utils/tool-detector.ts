export const DEFAULT_SECURITY_TOOLS = ['trivy', 'snyk', 'osv-scanner', 'grype'] as const;

export type SecurityToolName = (typeof DEFAULT_SECURITY_TOOLS)[number];

export interface ToolDetection {
	name: string;
	available: boolean;
	path: string | null;
}

import {which, type WhichOptions} from './runtime.ts';

/**
 * Locate an executable on PATH using `Bun.which`.
 */
export function detectTool(name: string, options?: WhichOptions): string | null {
	return which(name, options);
}

/**
 * Detect a set of external security tools.
 */
export function detectTools(names: readonly string[] = DEFAULT_SECURITY_TOOLS): ToolDetection[] {
	return names.map(name => {
		const path = detectTool(name);
		return {name, available: path !== null, path};
	});
}
