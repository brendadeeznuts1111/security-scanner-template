import {escapeHtml} from '../../utils/escape-html.ts';
import type {TranspilerReportFormat, TranspilerScanReport, TranspilerScanResult} from './types.ts';

const SEVERITY_ORDER: Record<TranspilerScanResult['severity'], number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
};

function sortFindings(findings: TranspilerScanResult[]): TranspilerScanResult[] {
	return [...findings].sort((a, b) => {
		const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
		if (severity !== 0) return severity;
		if (a.file !== b.file) return a.file.localeCompare(b.file);
		return (a.line ?? 0) - (b.line ?? 0);
	});
}

export function formatTranspilerReportJson(report: TranspilerScanReport): string {
	return JSON.stringify(
		{
			...report,
			findings: sortFindings(report.findings),
		},
		null,
		2,
	);
}

export function formatTranspilerReportMarkdown(report: TranspilerScanReport): string {
	const lines: string[] = [
		'# Transpiler Scan Report',
		'',
		`| Field | Value |`,
		`| --- | --- |`,
		`| Root | \`${report.root}\` |`,
	];

	if (report.domain) {
		lines.push(`| Domain | \`${report.domain}\` |`);
	}

	lines.push(
		`| Scanned files | ${report.scannedFiles} |`,
		`| Findings | ${report.findings.length} |`,
	);

	if (report.durationMs !== undefined) {
		lines.push(`| Duration | ${report.durationMs.toFixed(2)} ms |`);
	}

	lines.push('', '## Findings', '');

	const findings = sortFindings(report.findings);
	if (findings.length === 0) {
		lines.push('_No findings._');
	} else {
		for (const finding of findings) {
			const loc =
				finding.line !== undefined
					? `${finding.file}:${finding.line}${finding.column !== undefined ? `:${finding.column}` : ''}`
					: finding.file;
			lines.push(
				`### ${finding.severity.toUpperCase()} — ${finding.ruleId}`,
				'',
				`- **Location:** \`${loc}\``,
				`- **Message:** ${finding.message}`,
			);
			if (finding.snippet) {
				lines.push(`- **Snippet:** \`${finding.snippet}\``);
			}
			if (finding.integrityMismatch) {
				lines.push(`- **Hash:** \`${finding.hash}\` (expected \`${finding.hashExpected}\`)`);
			}
			lines.push('');
		}
	}

	return lines.join('\n');
}

export function formatTranspilerReportHtml(report: TranspilerScanReport): string {
	const findings = sortFindings(report.findings);
	const rows = findings
		.map(finding => {
			const loc = finding.line !== undefined ? `${finding.file}:${finding.line}` : finding.file;
			return `<tr>
  <td><span class="sev sev-${finding.severity}">${escapeHtml(finding.severity)}</span></td>
  <td><code>${escapeHtml(finding.ruleId)}</code></td>
  <td><code>${escapeHtml(loc)}</code></td>
  <td>${escapeHtml(finding.message)}</td>
</tr>`;
		})
		.join('\n');

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Transpiler Scan — ${escapeHtml(report.domain ?? report.root)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; background: #0a0a0f; color: #f5f5f7; }
    h1 { font-size: 1.4rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { border-bottom: 1px solid #333; padding: 0.5rem 0.75rem; text-align: left; vertical-align: top; }
    code { font-size: 0.85em; }
    .meta { color: #8e8e93; margin-bottom: 1rem; }
    .sev { font-weight: 600; text-transform: uppercase; font-size: 0.75rem; }
    .sev-critical { color: #ff453a; }
    .sev-high { color: #ff9500; }
    .sev-medium { color: #ffd60a; }
    .sev-low { color: #30d158; }
  </style>
</head>
<body>
  <h1>Transpiler Scan Report</h1>
  <p class="meta">
    Root: <code>${escapeHtml(report.root)}</code>
    ${report.domain ? ` · Domain: <code>${escapeHtml(report.domain)}</code>` : ''}
    · Files: ${report.scannedFiles}
    · Findings: ${report.findings.length}
    ${report.durationMs !== undefined ? ` · ${report.durationMs.toFixed(2)} ms` : ''}
  </p>
  <table>
    <thead>
      <tr><th>Severity</th><th>Rule</th><th>Location</th><th>Message</th></tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="4">No findings.</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
}

export function formatTranspilerReport(
	report: TranspilerScanReport,
	format: TranspilerReportFormat,
): string {
	switch (format) {
		case 'markdown':
			return formatTranspilerReportMarkdown(report);
		case 'html':
			return formatTranspilerReportHtml(report);
		default:
			return formatTranspilerReportJson(report);
	}
}

export function hasCriticalFindings(findings: TranspilerScanResult[]): boolean {
	return findings.some(finding => finding.severity === 'critical' || finding.severity === 'high');
}
