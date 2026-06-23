import type {DomainRegistry} from '../config/registry.ts';
import {createDomainSecurity} from '../config/security.ts';
import {resolveDomainAuditMasterKey} from '../domain/audit-paths.ts';
import {Domain} from '../domain/index.ts';
import {Registry} from '../registry/index.ts';
import {FEATURE_SCAN_EXTERNAL} from '../features/index.ts';
import {SecurityShell, type SecurityShellOptions} from '../interactive/index.ts';
import {ToolRunner, type PtyRunResult} from '../scan/tools.ts';
import type {AuditEntry} from '../audit/types.ts';
import {
	AuditVisualProcessor,
	ImageMetadataAnalyzer,
	ImagePipeline,
	QRGenerator,
	ReportImageRenderer,
	ThumbnailGenerator,
	type ImageInspection,
	type ImagePipelineOptions,
	type ImagePipelineResult,
	type ImageSource,
	type ReportImageOptions,
	type ThumbnailOptions,
} from '../visual/index.ts';

import {generateEnrichedReport} from '../report/enrich.ts';
import {ReportGenerator} from '../report/generator.ts';
import type {ReportData} from '../report/types.ts';
import {buildServeInit, resolveServeOptions, type ServiceOptions} from './serve-options.ts';
import {
	BundleScanner,
	resolveTranspilerConfig,
	loadProjectTranspilerRules,
	resolveTranspilerRules,
	type ScanBundlesOptions,
	type TranspilerScanReport,
} from '../scan/transpiler/index.ts';
import {
	checkFeedMinVersion,
	readProjectDependencyVersions,
	readThreatFeedVersion,
} from '../intel/semver-checks.ts';
import {scanPackageSemverViolations, type SemverScanReport} from '../intel/semver-scan.ts';
import {
	buildPatternScanReport,
	type PatternScanReport,
} from '../intel/pattern-remediation.ts';
import {scanPolicyConstraints} from '../intel/constraint-checks.ts';
import type {ConstraintScanReport} from '../intel/constraint-types.ts';
import {computeBundleSnapshotAtPath} from '../domain/doctor-snapshot-bundles.ts';
import {loadSnapshotWithVersionCheck, resolveSnapshotRoot} from '../domain/doctor-snapshot.ts';
import {snapshotPolicyFromDocument} from '../policy/engine.ts';
import {loadProjectPolicies} from '../policy/loader.ts';
import {resolveScannerVersion} from '../intel/scanner-version.ts';
import {auditBundleNetwork} from '../intel/network-audit.ts';
import {
	resolveAllEndpointProbeTargets,
	scanDomainEndpointProbes,
} from '../intel/endpoint-scan.ts';
import type {EndpointProbeReport, EndpointProbeTarget} from '../intel/endpoint-types.ts';
import {resolveHealthUrl} from '../network/health-secrets.ts';
import {NetworkLoop, type NetworkLoopOptions} from '../network/loop.ts';
import {
	ENDPOINT_PROBE_CATALOG_PATH,
	ENDPOINT_PROBE_META_PATH,
	handleEndpointProbeApi,
} from './probe-api.ts';
import {resolveNetworkConfig, type NetworkConfigOverrides} from '../network/resolve-config.ts';
import type {NetworkAuditSummary, NetworkLoopStatus} from '../network/types.ts';
import {defaultNetworkBaselinePath} from '../intel/network-baseline.ts';
import path from 'path';

export type RouteHandler = (req: Request) => Response | Promise<Response>;
export type {ServiceOptions} from './serve-options.ts';
export {buildServeInit, resolveServeOptions} from './serve-options.ts';
export {
	ENDPOINT_PROBE_CATALOG_PATH,
	ENDPOINT_PROBE_META_PATH,
	handleEndpointProbeApi,
} from './probe-api.ts';

/**
 * Service runtime that executes a domain's security primitives.
 *
 * The Service wires a Domain to a Bun.serve-compatible request handler, applying
 * CSRF protection, DNS reputation checks, and audit logging on the boundary.
 */
export class Service {
	private domain?: Domain;
	private server?: ReturnType<typeof Bun.serve>;
	private networkLoop?: NetworkLoop;
	private lastNetworkExitCode = 0;

	private readonly registry: DomainRegistry;
	private readonly domainName: string;
	private readonly route: RouteHandler;

	constructor(
		registry: DomainRegistry,
		domainName: string,
		route: RouteHandler = () => new Response('Not Found', {status: 404}),
	) {
		this.registry = registry;
		this.domainName = domainName;
		this.route = route;
	}

	/**
	 * Load the domain security context and instantiate runtime shims.
	 */
	async initialize(): Promise<void> {
		const config = this.registry.get(this.domainName);
		const security = await this.registry.security(this.domainName);
		const auditMasterKey = this.resolveAuditMasterKey(config);
		this.domain = await Domain.create(config, new Registry(), {
			csrfSecret: security.csrfSecret,
			auditMasterKey,
		});
	}

	/**
	 * Validate threat-feed semver against `intel.semver.feedMinVersion`.
	 */
	async validateThreatFeedSemver(root: string = process.cwd()): Promise<{
		ok: boolean;
		message?: string;
	}> {
		const config = this.registry.get(this.domainName);
		const minRange = config.intel?.semver?.feedMinVersion;
		if (!minRange) {
			return {ok: true};
		}
		const feedVersion = await readThreatFeedVersion(root, config);
		return checkFeedMinVersion(feedVersion, minRange);
	}

	private resolveAuditMasterKey(
		config: import('../config/types.ts').DomainConfig,
	): string | undefined {
		return resolveDomainAuditMasterKey(config);
	}

	/**
	 * Generate a CSRF token for the configured domain.
	 */
	generateCsrfToken(sessionId?: string): string {
		if (!this.domain) {
			throw new Error('Service not initialized');
		}
		if (!this.domain.csrf) {
			throw new Error('CSRF not enabled for this domain');
		}
		return this.domain.csrf.generate(sessionId);
	}

	/**
	 * Start a Bun.serve server bound to the service handler.
	 */
	async start(options: ServiceOptions = {}): Promise<ReturnType<typeof Bun.serve>> {
		if (!this.domain) {
			await this.initialize();
		}

		const config = this.registry.get(this.domainName);
		const resolved = resolveServeOptions(config, options);
		if (resolved.http3 && !resolved.tls) {
			throw new Error('HTTP/3 requires TLS configuration (service.tls.cert and service.tls.key)');
		}

		this.server = Bun.serve(buildServeInit(resolved, (req: Request) => this.handleRequest(req)));

		const network = config.service?.network;
		if (network?.enabled) {
			await this.startNetworkMonitor();
		}

		return this.server;
	}

	/** Bound listen port after start(), if the server is running. */
	get boundPort(): number | undefined {
		return this.server?.port;
	}

	/** Bound hostname after start(), if the server is running. */
	get boundHostname(): string | undefined {
		return this.server?.hostname;
	}

	/**
	 * Stop the running server.
	 */
	stop(): void {
		this.stopNetworkMonitor();
		this.server?.stop(true);
		this.server = undefined;
	}

	/**
	 * Start the per-domain network audit loop (dist patterns, semver, health).
	 */
	async startNetworkMonitor(
		options: {
			networkOverrides?: NetworkConfigOverrides;
			onHealthFailure?: NetworkLoopOptions['onHealthFailure'];
			onDriftFailure?: NetworkLoopOptions['onDriftFailure'];
		} = {},
	): Promise<NetworkLoopStatus> {
		if (!this.domain) {
			await this.initialize();
		}

		const config = this.registry.get(this.domainName);
		const baseNetwork = config.service?.network;
		if (!baseNetwork?.enabled) {
			throw new Error(`Network monitor is disabled for domain ${this.domainName}`);
		}
		if (this.networkLoop?.status().running) {
			return this.networkLoop.status();
		}

		const projectRoot = this.registry.root;
		const resolved = resolveNetworkConfig({
			domain: this.domainName,
			projectRoot,
			network: baseNetwork,
			domainConfig: config,
			overrides: options.networkOverrides,
		});

		this.networkLoop = new NetworkLoop({
			domainId: this.domainName,
			projectRoot,
			distPath: resolved.resolvedDistPath,
			domainConfig: config,
			healthUrl: resolved.healthUrl,
			healthUrlSecret: resolved.healthUrlSecret,
			baselinePath: resolved.resolvedBaselinePath,
			updateBaseline: resolved.updateBaseline,
			probeInterval: resolved.probeInterval,
			watch: resolved.watch,
			watchInterval: resolved.watchInterval,
			failOnHealth: resolved.failOnHealth,
			failOnDrift: resolved.failOnDrift,
			emitJson: resolved.json,
			emitHerdrTab: resolved.herdrTab,
			noColor: resolved.noColor,
			scanPatterns: dir => this.registry.scanPatterns(dir, projectRoot),
			checkPackageVersions: packages => this.registry.checkPackageVersions(packages),
			recordAudit: summary => this.recordNetworkAudit(summary),
			onHealthFailure: options.onHealthFailure,
			onDriftFailure: options.onDriftFailure,
		});

		await this.networkLoop.start();
		this.lastNetworkExitCode = this.networkLoop.lastExit();
		return this.networkLoop.status();
	}

	/** Exit code from the most recent network monitor start/tick (CI gates). */
	lastNetworkExit(): number {
		return this.networkLoop?.lastExit() ?? this.lastNetworkExitCode;
	}

	/** Stop the network audit loop without stopping the HTTP server. */
	stopNetworkMonitor(): void {
		this.networkLoop?.stop();
		this.networkLoop = undefined;
	}

	/** Current network monitor status (idle when not running). */
	networkMonitorStatus(): NetworkLoopStatus {
		if (this.networkLoop) {
			return this.networkLoop.status();
		}
		const config = this.registry.has(this.domainName)
			? this.registry.get(this.domainName)
			: undefined;
		const network = config?.service?.network;
		const projectRoot = this.registry.root;
		return {
			running: false,
			domain: this.domainName,
			distPath: path.resolve(projectRoot, network?.distPath ?? './dist'),
			healthUrl: network?.healthUrl,
			healthUrlSecret: network?.healthUrlSecret,
			baselinePath:
				network?.baselinePath ??
				defaultNetworkBaselinePath(this.domainName, projectRoot),
			probeIntervalMs: network?.probeInterval ?? 8000,
			watchEnabled: network?.watch === true,
			watchIntervalMs: network?.watchInterval ?? 750,
			probeCount: 0,
			auditCount: 0,
			failOnHealth: network?.failOnHealth === true,
			failOnDrift: network?.failOnDrift === true,
			emitJson: network?.json === true,
			emitHerdrTab: network?.herdrTab === true,
		};
	}

	private async recordNetworkAudit(summary: NetworkAuditSummary): Promise<void> {
		if (!this.domain?.audit) {
			return;
		}

		const blocking =
			summary.semverViolations > 0 ||
			summary.patternMatches > 0 ||
			summary.healthStatus === 'degraded' ||
			summary.healthStatus === 'unreachable';

		const level: 'fatal' | 'warn' | 'info' =
			summary.healthStatus === 'unreachable' || summary.semverViolations > 0
				? 'fatal'
				: summary.patternMatches > 0 || summary.healthStatus === 'degraded'
					? 'warn'
					: 'info';

		const description = [
			`patterns=${summary.patternMatches}`,
			`semver=${summary.semverViolations}`,
			summary.healthStatus ? `health=${summary.healthStatus}` : null,
			summary.healthLatencyMs != null ? `latency=${summary.healthLatencyMs}ms` : null,
		]
			.filter(Boolean)
			.join(' ');

		await this.audit({
			id: `network-audit-${Date.now()}`,
			package: this.domainName,
			version: '0.0.0',
			requestedRange: '*',
			advisories: [
				{
					level,
					package: 'network-audit',
					version: '0.0.0',
					url: null,
					description,
					categories: ['network-audit'],
				},
			],
			allowed: !blocking,
			decidedAt: summary.timestamp,
		});
	}

	/**
	 * Handle a single request through the domain's security middleware.
	 */
	async handleRequest(req: Request): Promise<Response> {
		const probeResponse = await handleEndpointProbeApi(req, {
			listTargets: () => this.listEndpointProbeTargets(),
			runProbes: () => this.probeAllEndpoints(),
		});
		if (probeResponse) {
			return probeResponse;
		}

		if (this.domain?.csrf) {
			return this.domain.csrf.middleware(req, () => this.route(req));
		}
		return this.route(req);
	}

	/** Resolved probe targets: domain + policy + health URL + bundle routes. */
	async listEndpointProbeTargets(
		options: {distPath?: string; healthUrl?: string} = {},
	): Promise<EndpointProbeTarget[]> {
		const root = this.registry.root;
		const config = this.registry.get(this.domainName);
		const policy = await loadProjectPolicies(root);
		const healthUrl =
			options.healthUrl ??
			(
				await resolveHealthUrl({
					healthUrl: config.service?.network?.healthUrl,
					healthUrlSecret: config.service?.network?.healthUrlSecret,
					domain: this.domainName,
					domainService: config.secrets.service,
				})
			).url;
		let bundleNetwork;
		const dist = path.resolve(
			root,
			options.distPath ?? config.service?.network?.distPath ?? './dist',
		);
		bundleNetwork = await auditBundleNetwork(dist);
		return resolveAllEndpointProbeTargets(config, policy, {healthUrl, bundleNetwork});
	}

	/** Run meta/security probes against every resolved endpoint. */
	async probeAllEndpoints(
		options: {distPath?: string; healthUrl?: string; timeoutMs?: number} = {},
	): Promise<EndpointProbeReport> {
		const root = this.registry.root;
		const config = this.registry.get(this.domainName);
		const policy = await loadProjectPolicies(root);
		const healthUrl =
			options.healthUrl ??
			(
				await resolveHealthUrl({
					healthUrl: config.service?.network?.healthUrl,
					healthUrlSecret: config.service?.network?.healthUrlSecret,
					domain: this.domainName,
					domainService: config.secrets.service,
				})
			).url;
		const dist = path.resolve(
			root,
			options.distPath ?? config.service?.network?.distPath ?? './dist',
		);
		const bundleNetwork = await auditBundleNetwork(dist);
		return scanDomainEndpointProbes({
			root,
			domain: this.domainName,
			config,
			policy,
			healthUrl,
			bundleNetwork,
			timeoutMs: options.timeoutMs,
		});
	}

	/**
	 * Inspect a hostname using the domain's DNS threat configuration.
	 */
	async inspectHostname(hostname: string) {
		if (!this.domain?.dns) {
			return null;
		}
		return this.domain.dns.inspect(hostname);
	}

	/**
	 * Run an external security scanner with Bun.Terminal PTY support.
	 *
	 * Requires `service.interactive: true` in the domain config.
	 */
	async runInteractiveScanner(
		tool: string,
		args: string[] = [],
		options: {cwd?: string; env?: Record<string, string>} = {},
	): Promise<PtyRunResult> {
		const config = this.registry.get(this.domainName);
		if (!config.service?.interactive) {
			throw new Error(
				`Interactive scanning is disabled for domain ${this.domainName}; set service.interactive: true`,
			);
		}

		if (!FEATURE_SCAN_EXTERNAL) {
			throw new Error('SCAN_EXTERNAL is disabled in this build');
		}

		const {requireInteractiveSession} = await import('../utils/process.ts');
		requireInteractiveSession(`Interactive scan (${this.domainName})`);

		const runner = new ToolRunner();
		return runner.runInteractive(tool, {args, ...options});
	}

	/**
	 * Read all audit entries for the initialized domain.
	 */
	async readAuditEntries(): Promise<AuditEntry[]> {
		if (!this.domain) {
			await this.initialize();
		}
		if (!this.domain?.audit) {
			return [];
		}
		return this.domain.audit.readAll();
	}

	/**
	 * Launch an interactive operator shell for this service's registry.
	 */
	shell(options: Omit<SecurityShellOptions, 'domain'> = {}): SecurityShell {
		return new SecurityShell(this.registry, {
			...options,
			domain: this.domainName,
		});
	}

	/**
	 * Append an audit entry if the domain has an audit sink configured.
	 *
	 * When `imageSource` is provided, a thumbnail and thumbhash placeholder are
	 * generated and stored on `entry.visual` before persistence.
	 */
	async audit(
		entry: AuditEntry,
		options: {imageSource?: ImageSource; imagePath?: string} = {},
	): Promise<void> {
		if (!this.domain) {
			await this.initialize();
		}
		if (!this.domain?.audit) {
			return;
		}

		let toAppend = entry;
		if (options.imageSource) {
			toAppend = await AuditVisualProcessor.enrich(entry, options.imageSource, {
				imagePath: options.imagePath,
			});
		}

		await this.domain.audit.append(toAppend);
	}

	/**
	 * Generate a thumbnail for an audit image source.
	 */
	async generateAuditThumbnail(
		source: ImageSource,
		dest: string,
		options: ThumbnailOptions = {},
	): Promise<string> {
		return ThumbnailGenerator.save(
			source,
			dest,
			options.width,
			options.height,
			options.format,
			options.quality,
		);
	}

	/**
	 * Generate a thumbnail for an existing audit entry by id (requires a readable image source).
	 */
	async generateAuditThumbnailForEntry(
		entryId: string,
		source: ImageSource,
		options: ThumbnailOptions & {imagePath?: string} = {},
	): Promise<AuditEntry> {
		const entries = await this.readAuditEntries();
		const entry = entries.find(item => item.id === entryId);
		if (!entry) {
			throw new Error(`Audit entry not found: ${entryId}`);
		}

		const enriched = await AuditVisualProcessor.enrich(entry, source, {
			...options,
			imagePath: options.imagePath,
		});

		if (this.domain?.audit) {
			await this.domain.audit.append(enriched);
		}

		return enriched;
	}

	/**
	 * Inspect an image for dimension/format anomalies.
	 */
	async inspectImage(source: ImageSource): Promise<ImageInspection> {
		return ImageMetadataAnalyzer.inspect(source);
	}

	/**
	 * Strip EXIF and optionally convert to WebP via the Bun.Image pipeline.
	 */
	async normalizeImage(
		source: ImageSource,
		options: ImagePipelineOptions = {},
	): Promise<ImagePipelineResult> {
		return ImagePipeline.process(source, options);
	}

	/**
	 * Encode text as a QR image (requires external QR renderer until bundled).
	 */
	async generateTokenQR(text: string, dest: string): Promise<void> {
		await QRGenerator.save(text, dest);
	}

	/**
	 * Render an HTML report snapshot via Bun.WebView.
	 */
	async generateReportImage(reportHtml: string, options: ReportImageOptions = {}) {
		return ReportImageRenderer.render(reportHtml, options);
	}

	/**
	 * Generate HTML with an embedded domain operator QR (vault master token).
	 */
	async generateOperatorReportHtml(data: ReportData): Promise<string> {
		const config = this.registry.get(this.domainName);
		return generateEnrichedReport(data, 'html', {
			domain: this.domainName,
			registry: this.registry,
			colors: config.colors,
		});
	}

	/**
	 * Check installed dependency versions against `[[semver.rule]]` policy entries.
	 */
	async scanPackageVersions(
		options: {
			root?: string;
			threatFeed?: boolean;
			remediation?: boolean;
			feedUrl?: string;
			deepConstraints?: boolean;
			transitive?: boolean;
			sourcePath?: string;
			probeEndpoints?: boolean;
			probeTimeoutMs?: number;
		} = {},
	): Promise<SemverScanReport> {
		const root = options.root ?? process.cwd();
		const config = this.registry.get(this.domainName);
		const installed = await readProjectDependencyVersions(root);
		const packages = Object.fromEntries(installed.map(pkg => [pkg.name, pkg.version]));

		if (options.threatFeed || options.feedUrl) {
			await this.registry.loadThreatFeed(options.feedUrl, {
				local: config.supplyChain.feed?.local,
				remote: config.supplyChain.feed?.remote,
				cachePath: config.supplyChain.feed?.cachePath,
				cacheTtl: config.supplyChain.feed?.cacheTtl,
			});
		}

		return scanPackageSemverViolations(packages, {
			root,
			domain: this.domainName,
			config,
			includeThreatFeed: options.threatFeed === true || !!options.feedUrl,
			includeRemediation: options.remediation !== false,
			deepConstraints: options.deepConstraints === true,
			transitive: options.transitive,
			sourcePath: options.sourcePath,
			probeEndpoints: options.probeEndpoints === true,
			probeTimeoutMs: options.probeTimeoutMs,
			threatEntries:
				options.threatFeed || options.feedUrl ? this.registry.getLoadedThreats() : undefined,
		});
	}

	/**
	 * Deep constraint scan: packages, licenses, sources, and blocked imports.
	 */
	async scanConstraints(
		options: {
			root?: string;
			transitive?: boolean;
			sourcePath?: string;
			scanImports?: boolean;
		} = {},
	): Promise<ConstraintScanReport> {
		const root = options.root ?? this.registry.root;
		const policy = await loadProjectPolicies(root);
		return scanPolicyConstraints({
			root,
			policy,
			transitive: options.transitive,
			sourcePath: options.sourcePath,
			scanImports: options.scanImports,
			domain: this.domainName,
		});
	}

	/**
	 * Scan project source for regex and AST pattern rules from `security.policy.toml`.
	 */
	async scanSource(
		options: {path?: string; root?: string; remediation?: boolean} = {},
	): Promise<PatternScanReport> {
		const root = options.root ?? this.registry.root;
		const scanPath = options.path ?? 'src/';
		const matches = await this.registry.scanPatterns(scanPath, root);
		return buildPatternScanReport(matches, {
			root,
			path: scanPath,
			domain: this.domainName,
			includeRemediation: options.remediation !== false,
		});
	}

	/**
	 * Scan build artifacts and dependencies via Bun.Transpiler (Layer 4.5).
	 */
	async scanBundles(options: ScanBundlesOptions = {}): Promise<TranspilerScanReport> {
		if (!this.domain) {
			await this.initialize();
		}

		const config = this.registry.get(this.domainName);
		const transpilerConfig = resolveTranspilerConfig(config);

		if (!transpilerConfig.enabled) {
			return {
				domain: this.domainName,
				root: options.path ?? process.cwd(),
				scannedFiles: 0,
				findings: [],
				files: [],
			};
		}

		const projectRoot = process.cwd();
		const scanRoot = options.path ? path.resolve(projectRoot, options.path) : projectRoot;
		const loaded = await loadProjectTranspilerRules(projectRoot, transpilerConfig.rulesPath);
		const rules = resolveTranspilerRules(loaded, options.rules ?? transpilerConfig.rules);
		const hasher = this.domain!.registry.integrity;

		const scanner = new BundleScanner({
			config: transpilerConfig,
			rules,
			hasher,
			domain: this.domainName,
			verifyIntegrity: options.verifyIntegrity,
		});

		const report = await scanner.scan(scanRoot);

		const bundlePath = options.path ?? transpilerConfig.includePaths[0];
		let bundleSnapshot = bundlePath
			? await computeBundleSnapshotAtPath(projectRoot, bundlePath)
			: null;

		let bundleDrift: TranspilerScanReport['bundleDrift'];
		let snapshotCompatibility: TranspilerScanReport['snapshotCompatibility'];
		if (options.checkBundleDrift !== false && bundleSnapshot) {
			const snapshotRoot = resolveSnapshotRoot(projectRoot);
			const policyDocument = await loadProjectPolicies(projectRoot);
			const snapshotPolicy = snapshotPolicyFromDocument(policyDocument);
			const scannerVersion = await resolveScannerVersion(projectRoot);
			const baseline = await loadSnapshotWithVersionCheck(snapshotRoot, this.domainName, {
				snapshotPolicy,
				scannerVersion,
			});
			if (baseline.versionWarning || baseline.compatibility) {
				const compat = baseline.compatibility ?? {
					ok: false,
					snapshotVersion: baseline.snapshotVersion,
					scannerVersion: baseline.scannerVersion,
					message: baseline.versionWarning,
				};
				snapshotCompatibility = {
					ok: compat.ok,
					snapshotVersion: compat.snapshotVersion,
					scannerVersion: compat.scannerVersion,
					storedScannerVersion: baseline.storedScannerVersion,
					message: compat.message,
					migrationHint: compat.migrationHint,
				};
			}
			const previous = baseline.domain?.bundles;
			if (previous && snapshotCompatibility?.ok !== false) {
				bundleDrift = {
					changed: previous.hash !== bundleSnapshot.hash,
					previousHash: previous.hash,
					currentHash: bundleSnapshot.hash,
					path: bundleSnapshot.path,
				};
			}
		}

		let semverViolations: TranspilerScanReport['semverViolations'];
		if (options.includeSemverPolicy !== false || options.threatFeed || options.feedUrl) {
			const semver = await this.scanPackageVersions({
				root: projectRoot,
				threatFeed: options.threatFeed === true,
				feedUrl: options.feedUrl,
				remediation: false,
			});
			semverViolations = semver.violations.map(violation => ({
				package: violation.package,
				version: violation.version,
				ruleId: violation.ruleId ?? violation.rule?.id ?? 'semver',
				severity: violation.severity,
				description: violation.message,
			}));
		}

		if (this.domain?.audit && report.findings.length > 0) {
			const advisories = report.findings.map(finding => ({
				level: (finding.severity === 'critical' || finding.severity === 'high'
					? 'fatal'
					: 'warn') as 'fatal' | 'warn',
				package: finding.file,
				version: '0.0.0',
				url: null,
				description: `${finding.message}${finding.line ? ` (line ${finding.line})` : ''}`,
				categories: finding.category ? [finding.category] : ['transpiler'],
			}));

			await this.domain.audit.append({
				id: `transpiler-${Date.now()}`,
				package: this.domainName,
				version: '0.0.0',
				requestedRange: '*',
				advisories,
				allowed: !report.findings.some(f => f.severity === 'critical' || f.severity === 'high'),
				decidedAt: new Date().toISOString(),
			});
		}

		return {
			...report,
			bundleSnapshot: bundleSnapshot ?? undefined,
			bundleDrift,
			snapshotCompatibility,
			semverViolations,
		};
	}

	/**
	 * Close the service and any underlying resources.
	 */
	close(): void {
		this.stopNetworkMonitor();
		this.stop();
		this.domain?.close();
	}
}
