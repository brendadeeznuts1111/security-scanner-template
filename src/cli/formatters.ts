export type OutputFormat = 'human' | 'json';

export interface FormatterMeta {
	durationMs: number;
	feedSource: string;
	dryRun: boolean;
}

function severityRank(level: string): number {
	return {fatal: 0, warn: 1, info: 2}[level] ?? 3;
}

function colorize(hex: string, text: string): string {
	const code = Bun.color(hex, 'ansi') ?? '';
	return code ? `${code}${text}\x1b[0m` : text;
}

/**
 * Emit scan results to the terminal. JSON output goes to stdout;
 * human-readable progress goes to stderr.
 */
export function emitResults(
	advisories: Bun.Security.Advisory[],
	format: OutputFormat,
	meta: FormatterMeta,
): void {
	if (format === 'json') {
		const payload = {
			ok: advisories.length === 0,
			meta,
			advisories: [...advisories].sort((a, b) => severityRank(a.level) - severityRank(b.level)),
		};
		console.log(JSON.stringify(payload, null, 2));
		return;
	}

	if (advisories.length === 0) {
		console.error(colorize('#33dd66', '✓ No threats detected'));
		return;
	}

	console.error(colorize('#ff4444', `✕ ${advisories.length} threat(s) detected`));
	console.error(
		Bun.inspect.table(
			advisories.map(a => ({
				package: a.package,
				level: a.level,
				description: a.description ?? '',
				categories: a.categories?.join(', ') ?? '',
			})),
			['package', 'level', 'description', 'categories'],
			{colors: true},
		),
	);
}
