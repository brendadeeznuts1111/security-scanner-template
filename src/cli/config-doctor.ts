import {checkAllDomains, type DoctorIssue, type DoctorResult} from '../config/doctor.ts';

function colorize(hex: string, text: string): string {
	const code = Bun.color(hex, 'ansi') ?? '';
	return code ? `${code}${text}\x1b[0m` : text;
}

function severityColor(severity: string): string {
	return severity === 'error' ? '#FF453A' : severity === 'warning' ? '#FF9500' : '#0A84FF';
}

function formatIssue(issue: DoctorIssue): string {
	const label = issue.severity.toUpperCase();
	return `${colorize(severityColor(issue.severity), label)} ${issue.domain} — ${issue.field}: ${issue.message}`;
}

function formatResult(result: DoctorResult): string {
	const lines: string[] = [];

	if (result.ok) {
		lines.push(colorize('#30D158', '✓ All domain configs are healthy'));
	} else {
		lines.push(colorize('#FF453A', `✗ ${result.errors} error(s), ${result.warnings} warning(s)`));
	}

	for (const domain of result.domains) {
		lines.push('');
		lines.push(
			`${domain.ok ? colorize('#30D158', '✓') : colorize('#FF453A', '✗')} ${domain.domain}`,
		);
		lines.push(`  ${domain.path}`);
		for (const issue of domain.issues) {
			lines.push(`  ${formatIssue(issue)}`);
		}
	}

	return lines.join('\n');
}

export interface ConfigDoctorOptions {
	root?: string;
	json?: boolean;
}

/**
 * Run the config doctor CLI.
 */
export async function runConfigDoctor(options: ConfigDoctorOptions = {}): Promise<void> {
	const root = options.root ?? process.cwd();
	const result = await checkAllDomains(root);

	if (options.json) {
		console.log(JSON.stringify(result, null, 2));
		process.exit(result.ok ? 0 : 1);
	}

	console.error(formatResult(result));
	process.exit(result.ok ? 0 : 1);
}
