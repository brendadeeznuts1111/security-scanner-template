export interface DryRunOptions {
	dryRun?: boolean;
}

/**
 * Downgrade fatal advisories to warn when dry-run mode is enabled.
 * This lets callers preview policy changes without blocking installation.
 */
export function applyDryRun(
	advisories: Bun.Security.Advisory[],
	opts: DryRunOptions,
): Bun.Security.Advisory[] {
	if (!opts.dryRun) return advisories;

	return advisories.map(advisory => {
		if (advisory.level === 'fatal') {
			return {
				...advisory,
				level: 'warn' as const,
				description: `[DRY RUN] Would block: ${advisory.description ?? 'no description'}`,
			};
		}
		return advisory;
	});
}

/**
 * Count how many advisories would be fatal before any dry-run transformation.
 */
export function countFatal(advisories: Bun.Security.Advisory[]): number {
	return advisories.filter(a => a.level === 'fatal').length;
}
