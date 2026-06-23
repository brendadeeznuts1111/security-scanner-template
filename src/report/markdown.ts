import type {ReportAdvisory, ReportData} from './types.ts';

function severityEmoji(level: string): string {
	return {fatal: '🔴', warn: '🟡', info: '🔵'}[level] ?? '⚪';
}

function escapeMd(text: string): string {
	return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
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
	lines.push(`| Metric | Count |`);
	lines.push(`| --- | --- |`);
	lines.push(`| Risk score | ${data.riskScore}/100 |`);
	lines.push(`| Fatal | ${data.fatalCount} |`);
	lines.push(`| Warn | ${data.warnCount} |`);
	lines.push(`| Info | ${data.infoCount} |`);
	lines.push(`| Total | ${data.advisories.length} |`);
	lines.push('');

	if (data.advisories.length > 0) {
		lines.push('## Advisories\n');
		lines.push(`| Level | Package | Version | Categories | Description |`);
		lines.push(`| --- | --- | --- | --- | --- |`);
		for (const a of data.advisories) {
			lines.push(
				`| ${severityEmoji(a.level)} ${a.level} | ${escapeMd(a.package)} | ${a.version ?? '-'} | ${(a.categories ?? []).join(', ') || '-'} | ${escapeMd(a.description ?? '')} |`,
			);
		}
		lines.push('');
	} else {
		lines.push('No advisories detected. ✅\n');
	}

	if (data.overrides.length > 0) {
		lines.push('## Policy Overrides\n');
		lines.push(`| Action | Target | Reason |`);
		lines.push(`| --- | --- | --- |`);
		for (const o of data.overrides) {
			const target = o.package ?? o.category ?? o.cve ?? '*';
			lines.push(`| ${o.action} | ${escapeMd(target)} | ${escapeMd(o.reason)} |`);
		}
		lines.push('');
	}

	return lines.join('\n');
}
