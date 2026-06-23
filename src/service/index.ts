import type {DomainRegistry} from '../config/registry.ts';
import {createDomainSecurity} from '../config/security.ts';
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

export type RouteHandler = (req: Request) => Response | Promise<Response>;
export type {ServiceOptions} from './serve-options.ts';
export {buildServeInit, resolveServeOptions} from './serve-options.ts';

/**
 * Service runtime that executes a domain's security primitives.
 *
 * The Service wires a Domain to a Bun.serve-compatible request handler, applying
 * CSRF protection, DNS reputation checks, and audit logging on the boundary.
 */
export class Service {
	private domain?: Domain;
	private server?: ReturnType<typeof Bun.serve>;

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

	private resolveAuditMasterKey(
		config: import('../config/types.ts').DomainConfig,
	): string | undefined {
		const configured = config.audit?.sqlite?.masterKey;
		if (configured) {
			return configured;
		}
		if (configured === null) {
			return process.env.AUDIT_MASTER_KEY;
		}
		return undefined;
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
		this.server?.stop(true);
		this.server = undefined;
	}

	/**
	 * Handle a single request through the domain's security middleware.
	 */
	async handleRequest(req: Request): Promise<Response> {
		if (this.domain?.csrf) {
			return this.domain.csrf.middleware(req, () => this.route(req));
		}
		return this.route(req);
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
	 * Close the service and any underlying resources.
	 */
	close(): void {
		this.stop();
		this.domain?.close();
	}
}
