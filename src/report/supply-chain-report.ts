import type {ConstraintScanReport} from '../intel/constraint-types.ts';
import type {SemverScanReport} from '../intel/semver-scan.ts';
import type {TranspilerScanReport} from '../scan/transpiler/types.ts';
import {formatTranspilerReportMarkdown} from '../scan/transpiler/reporter.ts';
import type {SupplyChainScanProfile} from '../cli/supply-chain-profiles.ts';
import type {SupplyChainScanIdentity} from '../intel/scanner-identity.ts';
import type {SupplyChainRemediationPlan} from '../intel/supply-chain-remediation.ts';

export interface SupplyChainDeepScanReport {
	profile: SupplyChainScanProfile | 'default';
	projectRoot: string | null;
	bundlePath: string;
	identity: SupplyChainScanIdentity;
	bundle: TranspilerScanReport;
	packages?: SemverScanReport;
	constraints?: ConstraintScanReport;
	policyPresent: boolean;
	remediation?: SupplyChainRemediationPlan;
	durationMs: number;
}

function formatRemediationQueueMarkdown(plan: SupplyChainRemediationPlan): string {
	if (plan.queue.length === 0) {
		return '_No remediation actions planned._';
	}
	const lines = [
		'## Remediation queue',
		'',
		`| Auto-fixable | ${plan.autoFixableCount} |`,
		`| Manual | ${plan.manualCount} |`,
		'',
	];
	for (const action of plan.queue) {
		const tag = action.autoFixable ? 'auto' : 'manual';
		lines.push(`- **[${tag}/${action.layer}]** ${action.message}`);
		if (action.command) {
			lines.push(`  - \`${action.command}\``);
		}
	}
	return lines.join('\n');
}

function formatPartyLabel(party: SupplyChainScanIdentity['scanner']): string {
	const version = party.version ? `@${party.version}` : '';
	return `${party.name}${version}`;
}

function appendIdentityMarkdown(lines: string[], identity: SupplyChainScanIdentity): void {
	lines.push(
		`| Captured | ${identity.capturedAt} |`,
		`| Scanner | \`${formatPartyLabel(identity.scanner)}\` |`,
	);
	if (identity.scanner.author) {
		lines.push(`| Scanner author | ${identity.scanner.author} |`);
	}
	lines.push(`| Bun runtime | \`${identity.bun.version}\` (\`${identity.bun.revision}\`) |`);
	if (identity.target) {
		lines.push(`| Target project | \`${formatPartyLabel(identity.target)}\` |`);
		if (identity.target.author) {
			lines.push(`| Target author | ${identity.target.author} |`);
		}
	}
	if (identity.domain) {
		const label = identity.domainDisplayName
			? `${identity.domainDisplayName} (\`${identity.domain}\`)`
			: `\`${identity.domain}\``;
		lines.push(`| Domain | ${label} |`);
	}
}

function severityRank(severity: string): number {
	switch (severity) {
		case 'critical':
			return 0;
		case 'fatal':
			return 0;
		case 'high':
			return 1;
		case 'medium':
			return 2;
		case 'low':
			return 3;
		default:
			return 4;
	}
}

export function supplyChainScanHasBlockingFindings(report: SupplyChainDeepScanReport): boolean {
	if (report.bundle.findings.some(f => f.severity === 'critical' || f.severity === 'high')) {
		return true;
	}
	if (report.packages?.violations.some(v => v.severity === 'critical' || v.severity === 'high')) {
		return true;
	}
	if (
		report.constraints?.violations.some(v => v.severity === 'critical' || v.severity === 'high')
	) {
		return true;
	}
	return false;
}

export function formatSupplyChainScanJson(report: SupplyChainDeepScanReport): string {
	return JSON.stringify(report, null, 2);
}

export function formatSupplyChainScanMarkdown(report: SupplyChainDeepScanReport): string {
	const lines: string[] = [
		'# Supply Chain Scan Report',
		'',
		`| Field | Value |`,
		`| --- | --- |`,
		`| Profile | \`${report.profile}\` |`,
	];
	appendIdentityMarkdown(lines, report.identity);
	lines.push(
		`| Bundle path | \`${report.bundlePath}\` |`,
		`| Project root | \`${report.projectRoot ?? '(not found)'}\` |`,
		`| Policy | ${report.policyPresent ? 'security.policy.toml' : '_none — packages/constraints skipped_'} |`,
		`| Bundle files | ${report.bundle.scannedFiles} |`,
		`| Bundle findings | ${report.bundle.findings.length} |`,
		`| Package violations | ${report.packages?.violations.length ?? 0} |`,
		`| Constraint violations | ${report.constraints?.violations.length ?? 0} |`,
		`| Duration | ${report.durationMs.toFixed(2)} ms |`,
		'',
	);

	if (report.bundle.findings.length > 0) {
		lines.push('## Bundle (transpiler)', '');
		const bundleMd = formatTranspilerReportMarkdown({
			...report.bundle,
			root: report.bundlePath,
		});
		const findingsSection = bundleMd.split('## Findings')[1];
		if (findingsSection) {
			lines.push(findingsSection.trim(), '');
		}
	}

	if (report.packages && report.packages.violations.length > 0) {
		lines.push('## Installed packages (semver / threat)', '');
		for (const violation of [...report.packages.violations].sort(
			(a, b) => severityRank(a.severity) - severityRank(b.severity),
		)) {
			lines.push(
				`### ${violation.severity.toUpperCase()} — ${violation.package}@${violation.version}`,
				'',
				`- **Source:** ${violation.source}`,
				`- **Message:** ${violation.message}`,
				violation.ruleId ? `- **Rule:** ${violation.ruleId}` : '',
				'',
			);
		}
	}

	if (report.constraints && report.constraints.violations.length > 0) {
		lines.push('## Policy constraints', '');
		for (const violation of report.constraints.violations) {
			lines.push(
				`### ${violation.severity.toUpperCase()} — ${violation.ruleId ?? violation.source}`,
				'',
				`- **Package:** ${violation.package ?? '-'}`,
				`- **Message:** ${violation.message}`,
				violation.file ? `- **File:** \`${violation.file}\`` : '',
				'',
			);
		}
	}

	if (
		report.bundle.findings.length === 0 &&
		(report.packages?.violations.length ?? 0) === 0 &&
		(report.constraints?.violations.length ?? 0) === 0
	) {
		lines.push('_No findings across enabled scan layers._', '');
	}

	if (report.remediation && report.remediation.queue.length > 0) {
		lines.push('', formatRemediationQueueMarkdown(report.remediation), '');
	}

	return lines.filter(line => line !== '').join('\n');
}
