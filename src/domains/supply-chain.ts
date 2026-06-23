import {severityPolicyFromDocument, type PolicyDocument} from '../policy/index.ts';
import {
	createProvider,
	getPolicy,
	resetPolicy,
	setPolicy,
	type FeedConfig,
	type SecurityScannerProvider,
	type SeverityPolicy,
} from '../provider/index.ts';
import {
	computeRiskScore,
	generateReport,
	type ReportData,
	type ReportFormat,
} from '../report/index.ts';

export interface Advisory {
	level: 'fatal' | 'warn';
	package: string;
	version: string;
	url: string | null;
	description: string | null;
	categories: string[];
}

export interface InstallDecision {
	package: string;
	version: string;
	requestedRange: string;
	advisories: Advisory[];
	allowed: boolean;
	decidedAt: string;
}

export interface SupplyChainConfig {
	feed?: FeedConfig;
	policy?: SeverityPolicy;
	dryRun?: boolean;
	policyDocument?: PolicyDocument;
}

interface ActiveState {
	provider: SecurityScannerProvider | null;
	config: FeedConfig;
	policyDocument: PolicyDocument | null;
	dryRun: boolean;
	decisions: InstallDecision[];
}

const state: ActiveState = {
	provider: null,
	config: {},
	policyDocument: null,
	dryRun: false,
	decisions: [],
};

/**
 * Create a security scanner provider for the given feed configuration.
 */
export function createProviderFromConfig(config: FeedConfig): SecurityScannerProvider {
	return createProvider({config});
}

function rebuildProvider(): void {
	if (!state.provider) return;
	state.provider = createProvider({
		config: state.config,
		policy: getPolicy(),
		dryRun: state.dryRun,
		policyDocument: state.policyDocument ?? undefined,
	});
}

/**
 * Set the active severity policy. Fatal categories block installation;
 * warn categories prompt the user. If the scanner is already activated, the
 * active provider is rebuilt with the new policy.
 */
export function setSeverityPolicy(policy: SeverityPolicy): void {
	setPolicy(policy);
	rebuildProvider();
}

/**
 * Reset the severity policy to the built-in defaults.
 */
export function resetSeverityPolicy(): void {
	resetPolicy();
	rebuildProvider();
}

/**
 * Activate the supply-chain scanner. When called, this registers the scanner
 * with the current Bun install context by returning a provider that can be
 * consumed by `Bun.install`.
 */
export function activate(config: SupplyChainConfig = {}): SecurityScannerProvider {
	state.config = config.feed ?? {};
	state.dryRun = config.dryRun ?? false;
	state.policyDocument = config.policyDocument ?? null;

	const severityPolicy =
		config.policy ??
		(state.policyDocument ? severityPolicyFromDocument(state.policyDocument) : getPolicy());

	state.provider = createProvider({
		config: state.config,
		policy: severityPolicy,
		dryRun: state.dryRun,
		policyDocument: state.policyDocument ?? undefined,
	});
	return state.provider;
}

/**
 * Deactivate the supply-chain scanner and clear the audit buffer.
 */
export function deactivate(): void {
	state.provider = null;
	state.decisions = [];
	state.config = {};
	state.policyDocument = null;
	state.dryRun = false;
	resetPolicy();
}

/**
 * Scan a single package manually. Useful for CI gates or pre-commit hooks.
 */
export async function scanPackage(
	name: string,
	version: string,
	options: {dryRun?: boolean} = {},
): Promise<Advisory[]> {
	const dryRun = options.dryRun ?? state.dryRun;
	const provider =
		state.provider && state.dryRun === dryRun
			? state.provider
			: createProvider({
					config: state.config,
					dryRun,
					policyDocument: state.policyDocument ?? undefined,
					policy: state.policyDocument
						? severityPolicyFromDocument(state.policyDocument)
						: getPolicy(),
				});

	const pkg: Bun.Security.Package = {
		name,
		version,
		requestedRange: version,
		tarball: '',
	};

	const advisories = await provider.scan({packages: [pkg]});
	return advisories.map(advisory => ({
		level: advisory.level,
		package: name,
		version,
		url: advisory.url ?? null,
		description: advisory.description ?? null,
		categories: advisory.categories ?? [],
	}));
}

/**
 * Scan a list of packages. Used by watch mode to scan the entire dependency
 * snapshot in one pass.
 */
export async function scanAll(packages: Bun.Security.Package[]): Promise<Advisory[]> {
	const dryRun = state.dryRun;
	const provider =
		state.provider && state.dryRun === dryRun
			? state.provider
			: createProvider({
					config: state.config,
					dryRun,
					policyDocument: state.policyDocument ?? undefined,
					policy: state.policyDocument
						? severityPolicyFromDocument(state.policyDocument)
						: getPolicy(),
				});

	const advisories = await provider.scan({packages});
	const mapped = advisories.map(advisory => ({
		level: advisory.level,
		package: advisory.package,
		version: advisory.version ?? '',
		url: advisory.url ?? null,
		description: advisory.description ?? null,
		categories: advisory.categories ?? [],
	}));

	for (const pkg of packages) {
		const pkgAdvisories = mapped.filter(a => a.package === pkg.name && a.version === pkg.version);
		recordDecision({
			package: pkg.name,
			version: pkg.version,
			requestedRange: pkg.requestedRange,
			advisories: pkgAdvisories,
			allowed: pkgAdvisories.length === 0,
			decidedAt: new Date().toISOString(),
		});
	}

	return mapped;
}

/**
 * Record an install decision. This is called by the install hook after a scan
 * so the audit buffer can be queried later.
 */
export function recordDecision(decision: InstallDecision): void {
	state.decisions.push(decision);
}

/**
 * Return the recorded install decisions since activation. If `since` is a
 * Date or number of hours, only decisions after that point are returned.
 */
export async function audit(since?: Date | number): Promise<InstallDecision[]> {
	const cutoff =
		since === undefined
			? null
			: since instanceof Date
				? since.getTime()
				: Date.now() - since * 60 * 60 * 1000;

	if (cutoff === null) {
		return [...state.decisions];
	}

	return state.decisions.filter(d => new Date(d.decidedAt).getTime() >= cutoff);
}

/**
 * Clear the audit buffer.
 */
export function clearAuditBuffer(): void {
	state.decisions = [];
}

function buildReportData(
	decisions: InstallDecision[],
	overrides: PolicyDocument['override'],
): ReportData {
	const advisories: import('../report/types.ts').ReportAdvisory[] = [];
	for (const decision of decisions) {
		for (const a of decision.advisories) {
			advisories.push({
				level: a.level,
				package: a.package,
				version: a.version,
				url: a.url,
				description: a.description,
				categories: a.categories,
			});
		}
	}

	const fatalCount = advisories.filter(a => a.level === 'fatal').length;
	const warnCount = advisories.filter(a => a.level === 'warn').length;
	const infoCount = advisories.filter(a => a.level === 'info').length;

	return {
		generatedAt: new Date().toISOString(),
		feedSource: state.config.remote ?? state.config.local ?? 'default',
		riskScore: computeRiskScore(fatalCount, warnCount, infoCount),
		fatalCount,
		warnCount,
		infoCount,
		advisories,
		overrides: (overrides ?? []).map(o => ({
			package: o.package,
			version: o.version,
			cve: o.cve,
			category: o.category,
			action: o.action,
			to: o.to,
			reason: o.reason,
		})),
		dryRun: state.dryRun,
	};
}

/**
 * Generate a security report from the recorded install decisions.
 */
export async function report(format: ReportFormat, since?: Date | number): Promise<string> {
	const decisions = await audit(since);
	const data = buildReportData(decisions, state.policyDocument?.override);
	return generateReport(data, format);
}

/**
 * Check whether the scanner is activated and the configured feed is reachable.
 * Returns a simple status object for CLI `doctor` commands.
 */
export async function doctor(): Promise<{
	activated: boolean;
	feedConfigured: boolean;
	feedReachable?: boolean;
	error?: string;
}> {
	const activated = state.provider !== null;
	const feedConfigured = Boolean(state.config.remote || state.config.local);

	if (!activated) {
		return {activated: false, feedConfigured};
	}

	if (!feedConfigured) {
		return {activated: true, feedConfigured: false};
	}

	try {
		const advisories = await scanPackage('__healthcheck__', '1.0.0');
		return {
			activated: true,
			feedConfigured: true,
			feedReachable: true,
		};
	} catch (error) {
		return {
			activated: true,
			feedConfigured: true,
			feedReachable: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
