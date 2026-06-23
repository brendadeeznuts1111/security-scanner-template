/**
 * Workflow report formatting (table, json, ndjson, herdr).
 *
 * @see https://github.com/Effect-TS/effect/blob/main/packages/effect/src/Inspectable.ts
 * @see https://github.com/oven-sh/bun/blob/main/docs/runtime/utils.mdx
 */
import {formatTable} from '../utils/inspect.ts';
import {shouldColorize} from '../utils/process.ts';
import type {
	ScannerIssue,
	ScannerResult,
	WorkflowOutputFormat,
	WorkflowRunReport,
} from './types.ts';

const SEVERITY_RANK: Record<string, number> = {
	low: 1,
	medium: 2,
	high: 3,
	critical: 4,
};

export function severityRank(severity: string): number {
	return SEVERITY_RANK[severity] ?? 0;
}

export function maxSeverity(issues: readonly ScannerIssue[]): ScannerIssue['severity'] {
	let max: ScannerIssue['severity'] = 'low';
	for (const issue of issues) {
		if (severityRank(issue.severity) > severityRank(max)) {
			max = issue.severity;
		}
	}
	return max;
}

export function aggregateWorkflowReport(
	domain: string,
	results: readonly ScannerResult[],
	drift?: WorkflowRunReport['drift'],
): WorkflowRunReport {
	const allIssues = results.flatMap(result => result.issues);
	const hasFail = results.some(result => result.status === 'fail');
	const hasWarn = results.some(result => result.status === 'warning');
	return {
		domain,
		timestamp: new Date().toISOString(),
		results: [...results],
		issueCount: allIssues.length,
		maxSeverity: maxSeverity(allIssues),
		ok: !hasFail && !hasWarn,
		...(drift ? {drift} : {}),
	};
}

export function formatWorkflowTable(report: WorkflowRunReport, noColor = false): string {
	const rows = report.results.map(result => ({
		scanner: result.scannerId,
		status: result.status,
		issues: String(result.issues.length),
		metrics: result.metrics ? JSON.stringify(result.metrics) : '',
	}));
	const lines = [
		formatTable(rows, ['scanner', 'status', 'issues', 'metrics'], {
			colors: shouldColorize(process.stderr) && !noColor,
		}),
	];
	if (report.issueCount > 0) {
		lines.push('', 'Issues:');
		for (const result of report.results) {
			for (const issue of result.issues) {
				lines.push(`  [${issue.severity}] ${result.scannerId}: ${issue.message}`);
			}
		}
	}
	if (report.drift && Object.keys(report.drift).length > 0) {
		lines.push('', 'Seed drift:');
		for (const [scannerId, entry] of Object.entries(report.drift)) {
			lines.push(`  ${scannerId}: expected ${JSON.stringify(entry.expected)}`);
			lines.push(`           actual   ${JSON.stringify(entry.actual)}`);
		}
	}
	return lines.join('\n');
}

export function formatWorkflowMarkdown(report: WorkflowRunReport): string {
	const lines = [
		`# Workflow Report: ${report.domain}`,
		'',
		`- **Timestamp:** ${report.timestamp}`,
		`- **Issues:** ${report.issueCount}`,
		`- **Max severity:** ${report.maxSeverity}`,
		`- **OK:** ${report.ok}`,
		'',
		'## Scanners',
		'',
	];
	for (const result of report.results) {
		lines.push(`### ${result.scannerId} (${result.status})`, '');
		if (result.issues.length === 0) {
			lines.push('- No issues', '');
			continue;
		}
		for (const issue of result.issues) {
			lines.push(`- **[${issue.severity}]** ${issue.message}`);
		}
		lines.push('');
	}
	if (report.drift && Object.keys(report.drift).length > 0) {
		lines.push('## Seed drift', '', '```json', JSON.stringify(report.drift, null, 2), '```', '');
	}
	return `${lines.join('\n')}\n`;
}

export function formatWorkflowHerdr(report: WorkflowRunReport): string {
	const lines = [`[${report.timestamp}] workflow ${report.domain}`];
	for (const result of report.results) {
		lines.push(`${result.scannerId}: ${result.status} (${result.issues.length} issues)`);
		if (result.metrics) {
			lines.push(
				`  ${Object.entries(result.metrics)
					.map(([key, value]) => `${key}=${value}`)
					.join(' ')}`,
			);
		}
	}
	return `${lines.join('\n')}\n`;
}

export function formatWorkflowNdjson(report: WorkflowRunReport): string {
	return `${JSON.stringify({
		type: 'workflow',
		ts: report.timestamp,
		domain: report.domain,
		issueCount: report.issueCount,
		maxSeverity: report.maxSeverity,
		ok: report.ok,
		drift: report.drift,
		results: report.results,
	})}\n`;
}

export function formatWorkflowOutput(
	report: WorkflowRunReport,
	format: WorkflowOutputFormat,
	noColor = false,
): string {
	switch (format) {
		case 'json':
			return `${JSON.stringify(report, null, 2)}\n`;
		case 'ndjson':
			return formatWorkflowNdjson(report);
		case 'herdr':
			return formatWorkflowHerdr(report);
		default:
			return `${formatWorkflowTable(report, noColor)}\n`;
	}
}

export function workflowExitCode(
	report: WorkflowRunReport,
	options: {
		failOnIssue?: boolean;
		failOnSeverity?: ScannerIssue['severity'];
		failOnDrift?: boolean;
	} = {},
): number {
	if (options.failOnDrift && report.drift && Object.keys(report.drift).length > 0) {
		return 1;
	}
	if (!options.failOnIssue) {
		return report.results.some(result => result.status === 'fail') ? 1 : 0;
	}
	const minRank = severityRank(options.failOnSeverity ?? 'medium');
	const severe = report.results
		.flatMap(result => result.issues)
		.filter(issue => severityRank(issue.severity) >= minRank);
	return severe.length > 0 ? 1 : 0;
}
