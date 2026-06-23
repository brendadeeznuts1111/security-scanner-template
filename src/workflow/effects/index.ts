/**
 * Workflow effect runner — log, alert, fix, and report built-ins.
 *
 * This module also re-exports the plugin registry and interfaces so custom
 * effects can import them from the same entry point.
 */
import {existsSync} from 'fs';
import path from 'path';
import type {DomainRegistry} from '../../config/registry.ts';
import {
	applyPackageUpgrade,
	fetchRegistryVersions,
	suggestRemediation,
	type RemediationViolation,
} from '../../intel/semver-remediation.ts';
import {formatWorkflowMarkdown} from '../output.ts';
import {hasWorkflowSeedDrift} from '../seed.ts';
import {
	createWorkflowFetch,
	resolveWorkflowTlsOptions,
	type WorkflowFetchFn,
} from '../tls-fetch.ts';
import type {
	ScannerResult,
	WorkflowAlertPayload,
	WorkflowBunMetadata,
	WorkflowEffectsConfig,
	WorkflowEffectsResult,
	WorkflowFixResult,
	WorkflowRunReport,
	WorkflowSeedDrift,
	WorkflowTlsConfig,
} from '../types.ts';
import type {WorkflowSeedDocument} from '../seed.ts';
import {EffectRegistry} from './registry.ts';
import type {EffectContext} from './plugin.ts';

export {EffectRegistry} from './registry.ts';
export {type EffectConfig, type EffectContext, type EffectPlugin} from './plugin.ts';
export {AlertEffect, FixEffect, LogEffect, ReportEffect} from './builtins/index.ts';

export type {WorkflowFetchFn};

export interface WorkflowEffectsContext {
	domain: string;
	projectRoot: string;
	registry: DomainRegistry;
	report: WorkflowRunReport;
	results: readonly ScannerResult[];
	drift?: WorkflowSeedDrift | null;
	effects?: WorkflowEffectsConfig;
	/** Directory of custom `.ts` effect plugins (relative to projectRoot). */
	effectsDir?: string;
	bun?: WorkflowBunMetadata;
	tls?: WorkflowTlsConfig;
	dryRun?: boolean;
	includeBunVersion?: boolean;
	seedState?: WorkflowSeedDocument | null;
}

export interface WorkflowEffectHandlers {
	fetchFn?: WorkflowFetchFn;
	applyUpgrade?: typeof applyPackageUpgrade;
	fetchVersions?: (packageName: string) => Promise<string[]>;
}

export function buildWorkflowAlertPayload(
	report: WorkflowRunReport,
	drift?: WorkflowSeedDrift | null,
	includeBunVersion = true,
): WorkflowAlertPayload {
	return {
		domain: report.domain,
		timestamp: report.timestamp,
		ok: report.ok,
		issueCount: report.issueCount,
		maxSeverity: report.maxSeverity,
		results: report.results.map(result => ({
			scanner: result.scannerId,
			status: result.status,
			issues: result.issues.length,
		})),
		...(drift && hasWorkflowSeedDrift(drift) ? {drift} : {}),
		...(includeBunVersion !== false && report.bun ? {bun: report.bun} : {}),
	};
}

export async function sendWorkflowAlert(
	webhookUrl: string,
	payload: WorkflowAlertPayload,
	handlers: {
		fetchFn?: WorkflowFetchFn;
		tls?: WorkflowTlsConfig;
		projectRoot?: string;
	} = {},
): Promise<{ok: boolean; error?: string}> {
	const tlsOptions = await resolveWorkflowTlsOptions(
		handlers.tls,
		handlers.projectRoot ?? process.cwd(),
	);
	const fetchFn = handlers.fetchFn ?? createWorkflowFetch(tlsOptions);
	try {
		const response = await fetchFn(webhookUrl, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify(payload),
		});
		if (!response.ok) {
			return {ok: false, error: `HTTP ${response.status}`};
		}
		return {ok: true};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, error: message};
	}
}

export async function applyWorkflowFixes(
	ctx: Pick<WorkflowEffectsContext, 'domain' | 'projectRoot' | 'registry' | 'results'>,
	handlers: WorkflowEffectHandlers = {},
): Promise<WorkflowFixResult[]> {
	const semverResult = ctx.results.find(result => result.scannerId === 'semver');
	if (!semverResult) {
		return [];
	}

	const packages = semverResult.metrics?.packages;
	if (!packages || typeof packages !== 'object') {
		return [];
	}

	const violations = await ctx.registry.checkPackageVersions(packages as Record<string, string>);
	const actionable = violations.filter(
		violation => violation.rule.severity === 'high' || violation.rule.severity === 'critical',
	);
	if (actionable.length === 0) {
		return [];
	}

	const applyUpgrade = handlers.applyUpgrade ?? applyPackageUpgrade;
	const fetchVersions = handlers.fetchVersions ?? fetchRegistryVersions;
	const results: WorkflowFixResult[] = [];

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
		const suggestion = await suggestRemediation(remediationViolation, available);
		if (!suggestion.suggestedVersion) {
			results.push({
				package: violation.package,
				ok: false,
				message: `No safe upgrade for ${violation.package}@${violation.version}`,
			});
			continue;
		}

		console.error(
			`[workflow] ${ctx.domain} upgrading ${violation.package}@${violation.version} → ${suggestion.suggestedVersion}`,
		);
		const upgrade = await applyUpgrade(
			ctx.projectRoot,
			violation.package,
			suggestion.suggestedVersion,
		);
		results.push({package: violation.package, ...upgrade});
	}

	return results;
}

export async function generateWorkflowReport(
	report: WorkflowRunReport,
	reportPath: string,
	formatMarkdown: (value: WorkflowRunReport) => string,
): Promise<void> {
	const {ReportEffect} = await import('./builtins/report.ts');
	await new ReportEffect().run({
		domain: report.domain,
		projectRoot: path.dirname(reportPath),
		results: report.results,
		report,
		registry: {} as DomainRegistry,
		bun: report.bun ?? {
			version: Bun.version,
			revision: Bun.revision || undefined,
			platform: process.platform,
			isDebug: false,
		},
		options: {
			path: reportPath,
			format: () => formatMarkdown(report),
		},
	});
}

function resolveReportPath(domain: string, report: boolean | string, projectRoot: string): string {
	if (typeof report === 'string') {
		const trimmed = report.trim();
		return path.isAbsolute(trimmed) ? trimmed : path.join(projectRoot, trimmed);
	}
	return path.join(projectRoot, 'reports', `${domain}-workflow.md`);
}

export function resolveWorkflowEffectsDir(projectRoot: string, effectsDir: string): string {
	const trimmed = effectsDir.trim();
	return path.isAbsolute(trimmed) ? trimmed : path.join(projectRoot, trimmed);
}

async function configureEffectRegistry(
	effects: WorkflowEffectsConfig,
	handlers: WorkflowEffectHandlers,
	projectRoot: string,
	formatMarkdown?: (report: WorkflowRunReport) => string,
	effectsDir?: string,
): Promise<EffectRegistry> {
	const registry = new EffectRegistry();
	if (effects.log !== false) {
		registry.configure('log', {enabled: true});
	}
	if (effects.alert) {
		const tlsOptions = await resolveWorkflowTlsOptions(effects.tls, projectRoot);
		registry.configure('alert', {
			enabled: true,
			params: {
				url: effects.alert,
				fetchFn: handlers.fetchFn ?? createWorkflowFetch(tlsOptions),
			},
		});
	}
	if (effects.fix) {
		registry.configure('fix', {
			enabled: true,
			params: {...handlers} as Record<string, unknown>,
		});
	}
	if (effects.report) {
		registry.configure('report', {
			enabled: true,
			params: {
				path: effects.report,
				format: (ctx: EffectContext) =>
					formatMarkdown?.(ctx.report) ?? formatWorkflowMarkdown(ctx.report),
			},
		});
	}
	if (effectsDir) {
		const resolved = resolveWorkflowEffectsDir(projectRoot, effectsDir);
		if (existsSync(resolved)) {
			const loaded = await registry.loadFromDirectory(resolved);
			if (loaded.length > 0) {
				console.error(`[workflow] loaded custom effects from ${resolved}: ${loaded.join(', ')}`);
			}
		} else {
			console.error(`[workflow] effects directory not found: ${resolved}`);
		}
	}
	return registry;
}

export async function runWorkflowEffects(
	ctx: WorkflowEffectsContext,
	handlers: WorkflowEffectHandlers = {},
	formatMarkdown?: (report: WorkflowRunReport) => string,
): Promise<WorkflowEffectsResult> {
	const effects = ctx.effects;
	const result: WorkflowEffectsResult = {};
	if (!effects) {
		return result;
	}

	const shouldReact =
		ctx.report.issueCount > 0 ||
		(ctx.drift !== undefined && ctx.drift !== null && hasWorkflowSeedDrift(ctx.drift)) ||
		!ctx.report.ok;

	const builtinIds = new Set(['log', 'alert', 'fix', 'report']);
	const effectRegistry = await configureEffectRegistry(
		effects,
		handlers,
		ctx.projectRoot,
		formatMarkdown,
		ctx.effectsDir,
	);
	const customEffects = effectRegistry.registeredIds().filter(id => !builtinIds.has(id));
	if (customEffects.length > 0) {
		result.customEffects = customEffects;
	}
	if (effects.alert && !shouldReact) {
		effectRegistry.configure('alert', {enabled: false});
	}

	const bun = ctx.bun ??
		ctx.report.bun ?? {
			version: Bun.version,
			revision: Bun.revision || undefined,
			platform: process.platform,
			isDebug: false,
		};

	const effectCtx: EffectContext = {
		domain: ctx.domain,
		projectRoot: ctx.projectRoot,
		registry: ctx.registry,
		results: [...ctx.results],
		report: ctx.report,
		drift: ctx.drift,
		seedState: ctx.seedState,
		options: {},
		result,
		bun,
		tls: ctx.tls ?? effects.tls,
		dryRun: ctx.dryRun,
		includeBunVersion: ctx.includeBunVersion,
	};

	await effectRegistry.runAll(effectCtx);

	if (effects.alert && shouldReact) {
		result.alertSent = true;
	}

	if (effects.report) {
		result.reportPath = resolveReportPath(ctx.domain, effects.report, ctx.projectRoot);
	}

	return result;
}
