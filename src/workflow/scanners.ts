/**
 * Workflow scanner implementations (network, semver, patterns, TLS, DNS).
 *
 * @see https://github.com/oven-sh/bun/blob/main/docs/runtime/watch.mdx
 * @see https://github.com/Effect-TS/effect/blob/main/packages/effect/src/Schedule.ts
 */
import path from 'path';
import {existsSync} from 'fs';
import type {DomainRegistry} from '../config/registry.ts';
import type {DomainConfig} from '../config/types.ts';
import {Domain} from '../domain/index.ts';
import {Registry} from '../registry/index.ts';
import {readProjectDependencyVersions} from '../intel/semver-checks.ts';
import {TLSInspector, resolveUseSystemCA} from '../intel/tls/index.ts';
import {hostnameFromUrl, inspectDomain} from '../threat-intel/dns.ts';
import {runNetworkTick} from '../network/tick.ts';
import {resolveNetworkConfig} from '../network/resolve-config.ts';
import {resolveHealthUrl} from '../network/health-secrets.ts';
import type {ScannerIssue, ScannerResult} from './types.ts';

export interface WorkflowScanner {
	id: string;
	name: string;
	run(ctx: WorkflowScannerContext): Promise<ScannerResult>;
}

export interface WorkflowScannerContext {
	domain: Domain;
	config: DomainConfig;
	registry: DomainRegistry;
	projectRoot: string;
	tlsHost?: string;
	tlsPort?: number;
	tlsDeep?: boolean;
	patternPaths?: string[];
}

export const WORKFLOW_SCANNER_IDS = ['network', 'semver', 'patterns', 'tls', 'dns'] as const;
export type WorkflowScannerId = (typeof WORKFLOW_SCANNER_IDS)[number];

function timestamp(): string {
	return new Date().toISOString();
}

function resultBase(
	scannerId: string,
	domain: string,
): Pick<ScannerResult, 'scannerId' | 'domain' | 'timestamp'> {
	return {scannerId, domain, timestamp: timestamp()};
}

function statusFromIssues(issues: ScannerIssue[]): ScannerResult['status'] {
	if (issues.some(issue => issue.severity === 'critical' || issue.severity === 'high')) {
		return 'fail';
	}
	if (issues.length > 0) {
		return 'warning';
	}
	return 'pass';
}

async function runNetworkScanner(ctx: WorkflowScannerContext): Promise<ScannerResult> {
	const network = ctx.config.service?.network;
	const resolved = resolveNetworkConfig({
		domain: ctx.config.domain,
		projectRoot: ctx.projectRoot,
		network: network ?? {enabled: false},
		domainConfig: ctx.config,
	});

	const tick = await runNetworkTick({
		domainId: ctx.config.domain,
		projectRoot: ctx.projectRoot,
		distPath: resolved.resolvedDistPath,
		phase: 'tick',
		trigger: 'workflow',
		healthUrl: resolved.healthUrl,
		healthUrlSecret: resolved.healthUrlSecret,
		baselinePath: resolved.resolvedBaselinePath,
		updateBaseline: false,
		failOnHealth: false,
		failOnDrift: false,
		noColor: true,
		domainConfig: ctx.config,
		scanPatterns: dir => ctx.registry.scanPatterns(dir, ctx.projectRoot),
		checkPackageVersions: packages => ctx.registry.checkPackageVersions(packages),
	});

	const issues: ScannerIssue[] = [];
	const summary = tick.summary;
	if (summary.patternMatches > 0) {
		issues.push({
			severity: 'high',
			message: `${summary.patternMatches} pattern match(es) in dist`,
		});
	}
	if (summary.semverViolations > 0) {
		issues.push({
			severity: 'high',
			message: `${summary.semverViolations} semver violation(s)`,
		});
	}
	if (summary.healthStatus === 'degraded' || summary.healthStatus === 'unreachable') {
		issues.push({
			severity: summary.healthStatus === 'unreachable' ? 'critical' : 'high',
			message: `health probe ${summary.healthStatus}`,
		});
	}
	const hasRouteDrift =
		(tick.delta?.healthRoutes.added.length ?? 0) > 0 ||
		(tick.delta?.healthRoutes.removed.length ?? 0) > 0;
	if (tick.delta?.hasEndpointDrift || hasRouteDrift) {
		issues.push({
			severity: 'medium',
			message: 'network baseline drift detected',
		});
	}

	return {
		...resultBase('network', ctx.config.domain),
		status: tick.exitCode !== 0 ? 'fail' : statusFromIssues(issues),
		issues,
		metrics: {
			patterns: summary.patternMatches,
			semver: summary.semverViolations,
			endpoints: summary.bundleEndpoints ?? 0,
			routes: summary.bundleHealthRoutes ?? 0,
			healthStatus: summary.healthStatus ?? 'unknown',
			healthLatencyMs: summary.healthLatencyMs ?? 0,
		},
	};
}

async function runSemverScanner(ctx: WorkflowScannerContext): Promise<ScannerResult> {
	const installed = await readProjectDependencyVersions(ctx.projectRoot);
	const packages = Object.fromEntries(installed.map(entry => [entry.name, entry.version]));
	const violations = await ctx.registry.checkPackageVersions(packages);
	const issues: ScannerIssue[] = violations.map(violation => ({
		severity: violation.rule.severity,
		message: `${violation.package}@${violation.version} violates ${violation.rule.id}`,
		ruleId: violation.rule.id,
	}));

	return {
		...resultBase('semver', ctx.config.domain),
		status: statusFromIssues(issues),
		issues,
		metrics: {
			scanned: installed.length,
			violations: violations.length,
			packages,
		},
	};
}

async function runPatternsScanner(ctx: WorkflowScannerContext): Promise<ScannerResult> {
	const roots =
		ctx.patternPaths ??
		['src', 'dist', path.join('domains')].map(relative => path.resolve(ctx.projectRoot, relative));
	const issues: ScannerIssue[] = [];
	let files = 0;

	for (const root of roots) {
		if (!existsSync(root)) continue;
		const matches = await ctx.registry.scanPatterns(root, ctx.projectRoot);
		files += matches.length;
		for (const match of matches) {
			issues.push({
				severity: match.severity,
				message: match.message,
				file: match.file,
				line: match.line,
				column: match.column,
				ruleId: match.ruleId,
			});
		}
	}

	return {
		...resultBase('patterns', ctx.config.domain),
		status: statusFromIssues(issues),
		issues,
		metrics: {matches: issues.length, roots: roots.filter(root => existsSync(root)).length},
	};
}

async function runTlsScanner(ctx: WorkflowScannerContext): Promise<ScannerResult> {
	const issues: ScannerIssue[] = [];
	const network = ctx.config.service?.network;
	const healthResolution = network?.healthUrl
		? await resolveHealthUrl({
				domain: ctx.config.domain,
				healthUrl: network.healthUrl,
				healthUrlSecret: network.healthUrlSecret,
			})
		: undefined;
	const host =
		ctx.tlsHost ??
		(healthResolution?.url ? hostnameFromUrl(healthResolution.url) : null) ??
		hostnameFromUrl(ctx.config.supplyChain.feed.remote ?? '');

	if (!host) {
		return {
			...resultBase('tls', ctx.config.domain),
			status: 'warning',
			issues: [{severity: 'low', message: 'no TLS host resolved (set --tls-host or healthUrl)'}],
		};
	}

	const port = ctx.tlsPort ?? 443;
	const useSystemCA = resolveUseSystemCA(undefined, ctx.config.tls?.useSystemCA);
	const profile = await TLSInspector.inspect(host, port, {
		useSystemCA,
		deep: ctx.tlsDeep,
	});

	if (profile.certificate?.expired) {
		issues.push({severity: 'critical', message: `certificate expired for ${host}`});
	}
	if (profile.validatedWithSystemCA && profile.trusted === false) {
		issues.push({
			severity: 'high',
			message: profile.trustError ?? `untrusted certificate for ${host}`,
		});
	}
	if (profile.certificate?.selfSigned) {
		issues.push({severity: 'medium', message: `self-signed certificate for ${host}`});
	}
	if (profile.certificate && profile.certificate.daysRemaining < 14) {
		issues.push({
			severity: 'medium',
			message: `certificate expires in ${profile.certificate.daysRemaining} day(s)`,
		});
	}

	return {
		...resultBase('tls', ctx.config.domain),
		status: statusFromIssues(issues),
		issues,
		metrics: {
			daysRemaining: profile.certificate?.daysRemaining ?? -1,
			chainLength: profile.chain?.length ?? 1,
		},
	};
}

async function runDnsScanner(ctx: WorkflowScannerContext): Promise<ScannerResult> {
	const dnsConfig = ctx.config.intel?.dns ?? {};
	const issues: ScannerIssue[] = [];
	const hosts = new Set<string>();

	const feedHost = hostnameFromUrl(ctx.config.supplyChain.feed.remote ?? '');
	if (feedHost) hosts.add(feedHost);

	const network = ctx.config.service?.network;
	if (network?.healthUrl) {
		const healthResolution = await resolveHealthUrl({
			domain: ctx.config.domain,
			healthUrl: network.healthUrl,
			healthUrlSecret: network.healthUrlSecret,
		});
		const healthHost = healthResolution.url ? hostnameFromUrl(healthResolution.url) : null;
		if (healthHost) hosts.add(healthHost);
	}

	if (hosts.size === 0) {
		return {
			...resultBase('dns', ctx.config.domain),
			status: 'warning',
			issues: [{severity: 'low', message: 'no hostnames to inspect'}],
		};
	}

	for (const host of hosts) {
		const inspection = ctx.domain.dns
			? ctx.domain.dns.inspect(host)
			: inspectDomain(host, dnsConfig);
		const result = await inspection;
		if (result.suspicious) {
			issues.push({
				severity: 'high',
				message: result.reason ?? `suspicious DNS for ${host}`,
			});
		} else if (!result.resolved && dnsConfig.requireResolution !== false) {
			issues.push({
				severity: 'medium',
				message: `failed to resolve ${host}`,
			});
		}
	}

	return {
		...resultBase('dns', ctx.config.domain),
		status: statusFromIssues(issues),
		issues,
		metrics: {hosts: hosts.size},
	};
}

export const AVAILABLE_SCANNERS: readonly WorkflowScanner[] = [
	{id: 'network', name: 'Network & OpenAPI', run: runNetworkScanner},
	{id: 'semver', name: 'Package Version', run: runSemverScanner},
	{id: 'patterns', name: 'Source Code Patterns', run: runPatternsScanner},
	{id: 'tls', name: 'TLS Certificate', run: runTlsScanner},
	{id: 'dns', name: 'DNS Reputation', run: runDnsScanner},
];

export function resolveWorkflowScanners(ids?: readonly string[]): WorkflowScanner[] {
	const wanted = new Set(ids ?? WORKFLOW_SCANNER_IDS);
	return AVAILABLE_SCANNERS.filter(scanner => wanted.has(scanner.id));
}

export async function createWorkflowScannerContext(
	registry: DomainRegistry,
	domainName: string,
	options: {
		tlsHost?: string;
		tlsPort?: number;
		tlsDeep?: boolean;
		patternPaths?: string[];
	} = {},
): Promise<WorkflowScannerContext> {
	await registry.ensureDomain(domainName);
	const config = registry.get(domainName);
	const security = await registry.security(domainName);
	const domain = await Domain.create(config, new Registry(), {
		csrfSecret: security.csrfSecret,
	});
	return {
		domain,
		config,
		registry,
		projectRoot: registry.root,
		tlsHost: options.tlsHost,
		tlsPort: options.tlsPort,
		tlsDeep: options.tlsDeep,
		patternPaths: options.patternPaths,
	};
}
