export const DEFAULT_SECURITY_TOOLS = ['trivy', 'snyk', 'osv-scanner', 'grype'] as const;

export type SecurityToolName = (typeof DEFAULT_SECURITY_TOOLS)[number];

export interface ToolDetection {
	name: string;
	available: boolean;
	path: string | null;
}

/**
 * Locate an executable on PATH using Bun.which.
 */
export function detectTool(name: string): string | null {
	return Bun.which(name);
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
