import type {ReportAdvisory, ReportData} from './types.ts';
import {padVisible, stringWidth} from '../utils/terminal.ts';

function severityEmoji(level: string): string {
	return {fatal: '🔴', warn: '🟡', info: '🔵'}[level] ?? '⚪';
}

function escapeMd(text: string): string {
	return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function padCell(text: string, width: number): string {
	return padVisible(text, width);
}

function formatTableRow(cells: string[], widths: number[]): string {
	return `| ${cells.map((cell, index) => padCell(cell, widths[index] ?? cell.length)).join(' | ')} |`;
}

function tableWidths(headers: string[], rows: string[][]): number[] {
	const widths = headers.map((header, index) =>
		Math.max(stringWidth(header), ...rows.map(row => stringWidth(row[index] ?? ''))),
	);
	return widths;
}

function advisoryRows(advisories: ReportAdvisory[]): string[][] {
	return advisories.map(advisory => [
		`${severityEmoji(advisory.level)} ${advisory.level}`,
		escapeMd(advisory.package),
		advisory.version ?? '-',
		(advisory.categories ?? []).join(', ') || '-',
		escapeMd(advisory.description ?? ''),
	]);
}

/**
 * Generate a Markdown security report suitable for GitHub PR descriptions.
 */
export function generateMarkdownReport(data: ReportData): string {
	const lines: string[] = [];

	lines.push(`# Security Report — ${data.project ?? 'Project'}\n`);
	lines.push(`Generated at: ${data.generatedAt}`);
	lines.push(`Feed source: ${data.feedSource}`);
	if (data.scanDurationMs !== undefined) {
		lines.push(`Scan duration: ${data.scanDurationMs}ms`);
	}
	if (data.dryRun) {
		lines.push(`**Dry run — no installations were blocked.**`);
	}
	lines.push('');

	lines.push('## Summary\n');
	const summaryHeaders = ['Metric', 'Count'];
	const summaryRows = [
		['Risk score', `${data.riskScore}/100`],
		['Fatal', String(data.fatalCount)],
		['Warn', String(data.warnCount)],
		['Info', String(data.infoCount)],
		['Total', String(data.advisories.length)],
	];
	const summaryWidths = tableWidths(summaryHeaders, summaryRows);
	lines.push(formatTableRow(summaryHeaders, summaryWidths));
	lines.push(
		formatTableRow(
			summaryHeaders.map(() => '---'),
			summaryWidths,
		),
	);
	for (const row of summaryRows) {
		lines.push(formatTableRow(row, summaryWidths));
	}
	lines.push('');

	if (data.advisories.length > 0) {
		lines.push('## Advisories\n');
		const headers = ['Level', 'Package', 'Version', 'Categories', 'Description'];
		const rows = advisoryRows(data.advisories);
		const widths = tableWidths(headers, rows);
		lines.push(formatTableRow(headers, widths));
		lines.push(
			formatTableRow(
				headers.map(() => '---'),
				widths,
			),
		);
		for (const row of rows) {
			lines.push(formatTableRow(row, widths));
		}
		lines.push('');
	} else {
		lines.push('No advisories detected. ✅\n');
	}

	if (data.operatorQr) {
		const meta = data.operatorQr;
		lines.push('## Operator Access\n');
		lines.push(`Domain vault operator QR is configured for **${escapeMd(meta.domain)}**.`);
		if (meta.cacheKey) {
			lines.push(`Cache key: \`${meta.cacheKey}\``);
		}
		lines.push('');
		lines.push('```bash', `bun sp qr --domain ${meta.domain} --output operator-qr.png`, '```');
		lines.push('');
		lines.push(
			'> Sensitive — the QR encodes the vault master token. Do not commit generated images or HTML exports.',
		);
		lines.push('');
	}

	if (data.overrides.length > 0) {
		lines.push('## Policy Overrides\n');
		const headers = ['Action', 'Target', 'Reason'];
		const rows = data.overrides.map(override => {
			const target = override.package ?? override.category ?? override.cve ?? '*';
			return [override.action, escapeMd(target), escapeMd(override.reason)];
		});
		const widths = tableWidths(headers, rows);
		lines.push(formatTableRow(headers, widths));
		lines.push(
			formatTableRow(
				headers.map(() => '---'),
				widths,
			),
		);
		for (const row of rows) {
			lines.push(formatTableRow(row, widths));
		}
		lines.push('');
	}

	return lines.join('\n');
}
