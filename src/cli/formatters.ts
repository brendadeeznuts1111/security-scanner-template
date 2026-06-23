import {colorize, TERMINAL} from '../color/index.ts';
import {formatTable} from '../utils/inspect.ts';
import {writeHumanStderr, writeJsonStdout} from '../utils/process.ts';
import {getRuntimeInfo} from '../utils/runtime.ts';
import {wrapAnsi} from '../utils/terminal.ts';

export type OutputFormat = 'human' | 'json';

export interface FormatterMeta {
	durationMs: number;
	feedSource: string;
	dryRun: boolean;
	bunVersion?: string;
}

function severityRank(level: string): number {
	return {fatal: 0, warn: 1, info: 2}[level] ?? 3;
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
	const runtime = getRuntimeInfo();
	const enrichedMeta: FormatterMeta = {
		...meta,
		bunVersion: meta.bunVersion ?? runtime.version,
	};

	if (format === 'json') {
		const payload = {
			ok: advisories.length === 0,
			meta: enrichedMeta,
			runtime: {
				version: runtime.version,
				revision: runtime.revision.slice(0, 8),
			},
			advisories: [...advisories].sort((a, b) => severityRank(a.level) - severityRank(b.level)),
		};
		writeJsonStdout(payload);
		return;
	}

	if (advisories.length === 0) {
		writeHumanStderr(colorize(TERMINAL.scannerOk, '✓ No threats detected'));
		return;
	}

	writeHumanStderr(colorize(TERMINAL.scannerFatal, `✕ ${advisories.length} threat(s) detected`));
	const terminalWidth = Math.max(80, process.stderr.columns ?? 80);
	const rows = advisories.map(a => ({
		package: a.package,
		level: a.level,
		description: wrapAnsi(a.description ?? '', Math.max(24, terminalWidth - 48), {
			wordWrap: true,
			hard: false,
		}),
		categories: a.categories?.join(', ') ?? '',
	}));

	writeHumanStderr(formatTable(rows, ['package', 'level', 'description', 'categories']));
}
