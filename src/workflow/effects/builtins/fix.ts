/**
 * Built-in fix effect — attempts to auto-remediate high/critical semver violations.
 */
import {
	applyPackageUpgrade,
	suggestRemediation,
	fetchRegistryVersions,
	planPackageUpgrades,
	type RemediationViolation,
} from '../../../intel/semver-remediation.ts';
import {severityRank} from '../../output.ts';
import type {EffectPlugin, EffectContext} from '../plugin.ts';

export interface FixEffectOptions {
	fetchVersions?: (packageName: string) => Promise<string[]>;
	applyUpgrade?: typeof applyPackageUpgrade;
}

export class FixEffect implements EffectPlugin {
	id = 'fix';
	name = 'Fix';
	description = 'Attempts to automatically fix semver violations';

	condition(ctx: EffectContext): boolean {
		const semverResult = ctx.results.find(result => result.scannerId === 'semver');
		if (!semverResult || semverResult.issues.length === 0) {
			return false;
		}
		return semverResult.issues.some(issue => severityRank(issue.severity) >= severityRank('high'));
	}

	async run(ctx: EffectContext): Promise<void> {
		const semverResult = ctx.results.find(result => result.scannerId === 'semver');
		if (!semverResult) {
			return;
		}

		const packages = semverResult.metrics?.packages;
		if (!packages || typeof packages !== 'object' || Array.isArray(packages)) {
			return;
		}

		const options = ctx.options as FixEffectOptions;
		const violations = await ctx.registry.checkPackageVersions(packages as Record<string, string>);
		const actionable = violations.filter(
			violation => violation.rule.severity === 'high' || violation.rule.severity === 'critical',
		);
		if (actionable.length === 0) {
			return;
		}

		const fetchVersions = options.fetchVersions ?? fetchRegistryVersions;
		const applyUpgrade = options.applyUpgrade ?? applyPackageUpgrade;
		const remediated: Array<
			RemediationViolation & {remediation: Awaited<ReturnType<typeof suggestRemediation>>}
		> = [];

		for (const violation of actionable) {
			const remediationViolation: RemediationViolation = {
				package: violation.package,
				version: violation.version,
				safeRange: violation.rule.safeRange,
				rule: violation.rule,
				source: 'policy-rule',
				ruleId: violation.rule.id,
			};
			const available = await fetchVersions(violation.package);
			const remediation = await suggestRemediation(remediationViolation, available);
			remediated.push({...remediationViolation, remediation});
		}

		const plans = planPackageUpgrades(remediated);
		const results: {package: string; ok: boolean; message: string}[] = [];
		for (const plan of plans) {
			console.error(
				`[${ctx.domain}] Upgrading ${plan.package}@${plan.fromVersion} → ${plan.package}@${plan.toVersion}`,
			);
			const upgrade = await applyUpgrade(ctx.projectRoot, plan.package, plan.toVersion);
			results.push({package: plan.package, ...upgrade});
		}
		if (ctx.result) {
			ctx.result.fixes = results;
		}
	}
}
