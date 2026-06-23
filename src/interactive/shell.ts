import path from 'path';
import {colorize, TERMINAL} from '../color/index.ts';
import type {DomainRegistry} from '../config/registry.ts';
import {
	isBuildProfile,
	profileDescription,
	profileFeatures,
	PROFILE_NAMES,
	PROFILES,
	type BuildProfile,
} from '../build/profiles.ts';
import {createDomainContext, type DomainContext} from '../domain/context.ts';
import {domainDisplayName} from '../domain/branding.ts';
import type {ConfigVault} from '../domain/vault-config.ts';
import {
	ALL_FEATURES,
	buildFeatureArgs,
	FEATURES,
	FEATURE_SCAN_EXTERNAL,
	type FeatureName,
} from '../features/index.ts';
import {domainQrMessages, printDomainQrMessages, runDomainQr} from '../cli/qr.ts';
import {printTlsProfileTo, runTlsScan} from '../cli/tls.ts';
import {Service} from '../service/index.ts';

import {ToolRunner} from '../scan/tools.ts';
import {spawnInherit} from '../utils/process.ts';
import {createLineReader, type LineReader} from './readline.ts';
import {parseCommandLine} from './parse.ts';
import {ShellTerminal} from './terminal.ts';

export interface SecurityShellOptions {
	domain?: string;
	lines?: readonly string[];
	outdir?: string;
	entry?: string;
}

export interface BuildShellResult {
	profile: BuildProfile;
	features: FeatureName[];
	outdir: string;
	exitCode: number;
}

/**
 * Interactive security operator shell backed by a shared Bun.Terminal PTY.
 */
export class SecurityShell {
	private readonly registry: DomainRegistry;
	private readonly terminal: ShellTerminal;
	private readonly reader: LineReader;
	private readonly outdir: string;
	private readonly entry: string;
	private domain?: string;
	private context?: DomainContext;
	private service?: Service;
	private tailAbort?: AbortController;

	constructor(registry: DomainRegistry, options: SecurityShellOptions = {}) {
		this.registry = registry;
		this.terminal = new ShellTerminal();
		this.reader = createLineReader(options.lines);
		this.domain = options.domain;
		this.outdir = options.outdir ?? 'dist';
		this.entry = options.entry ?? path.join(import.meta.dir, '..', 'index.ts');
	}

	get activeDomain(): string | undefined {
		return this.domain;
	}

	get sharedTerminal(): Bun.Terminal {
		return this.terminal.terminal;
	}

	async start(): Promise<void> {
		this.terminal.writeln(colorize(TERMINAL.scannerInfo, 'Bun Security Scanner REPL'));
		if (this.domain) {
			await this.ensureDomainsLoaded();
			await this.printDomainBanner(this.domain);
		}
		this.terminal.writeln(colorize(TERMINAL.scannerDim, "Type 'help' for commands, 'exit' to quit."));

		try {
			for (;;) {
				const prompt = await this.promptForActiveDomain();
				const line = await this.reader.readLine(prompt);
				if (line === null) break;

				const command = line.trim();
				if (!command) continue;
				if (command === 'exit' || command === 'quit') break;

				try {
					await this.handleCommand(command);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					this.terminal.writeln(colorize(TERMINAL.scannerFatal, `error: ${message}`));
				}
			}
		} finally {
			this.stopTail();
			this.service?.close();
			this.terminal.close();
			this.reader.close();
		}
	}

	private async handleCommand(cmd: string): Promise<void> {
		const parts = parseCommandLine(cmd);
		const verb = parts[0]?.toLowerCase();

		switch (verb) {
			case 'help':
				this.printHelp();
				return;
			case 'domain':
				await this.setDomain(parts[1]);
				return;
			case 'domains':
				await this.listDomains();
				return;
			case 'status':
				await this.showStatus(parts[1]);
				return;
			case 'features':
				this.showFeatures();
				return;
			case 'profiles':
				this.showProfiles();
				return;
			case 'scan':
				await this.runScan(parts.slice(1));
				return;
			case 'audit':
				await this.handleAudit(parts.slice(1));
				return;
			case 'build':
				await this.runBuild(parts.slice(1));
				return;
			case 'secrets':
				await this.handleSecrets(parts.slice(1));
				return;
			case 'colors':
				await this.showColors();
				return;
			case 'badge':
				await this.writeBadge(parts.slice(1));
				return;
			case 'qr':
				await this.runQr(parts.slice(1));
				return;
			case 'report':
				await this.runReportImage(parts.slice(1));
				return;
			case 'tls':
				await this.runTls(parts.slice(1));
				return;
			default:
				throw new Error(`unknown command: ${verb ?? '(empty)'}`);
		}
	}

	private printHelp(): void {
		const lines = [
			'Commands:',
			'  help                              Show this help',
			'  exit | quit                       Leave the REPL',
			'  domain <name>                     Set active domain context',
			'  domains                           List loaded domains',
			'  status [domain]                   Show domain configuration summary',
			'  colors                            Show domain palette (Bun.color ANSI swatches)',
			'  badge [--size N]                  Write domain badge PNG (Bun.Image)',
			'  features                          Show compile-time feature flags',
			'  profiles                          Show deployment build profiles',
			'  scan [tool] [args...]             Run external scanner with shared PTY',
			'  audit tail [--follow]             JSONL audit log (pipe shell output to jq/fx)',
			'  audit thumbnail --id <id> --input <path>  Generate audit image thumbnail',
			'  qr [--terminal] [--format svg|png|webp] [--out path] [--dark #hex] [--light #hex]',
			'                                      Domain master-token QR (defaults to --terminal)',
			'  qr --text <value> --out <path>          Encode arbitrary text as QR PNG',
			'  report --qr [--output report.html]            HTML report with operator QR',
			'  report --image --html <path> [--output <path>]  Screenshot HTML report',
			'  tls --host <hostname> [--port N] [--use-system-ca|--no-use-system-ca] [--deep]',
			'                                      Remote TLS scan (active domain context)',
			'  build --profile <name>            Build bundle (agent | server | dev)',
			'  secrets [status]                  List vault inventory + Bun.secrets status',
		];
		for (const line of lines) {
			this.terminal.writeln(colorize(TERMINAL.scannerDim, line));
		}
	}

	private async ensureDomainsLoaded(): Promise<void> {
		await this.registry.loadAll();
	}

	private async setDomain(name?: string): Promise<void> {
		if (!name) {
			this.terminal.writeln(
				colorize(
					TERMINAL.scannerInfo,
					this.domain ? `active domain: ${this.domain}` : 'no domain selected',
				),
			);
			return;
		}

		await this.ensureDomainsLoaded();
		if (!this.registry.has(name)) {
			throw new Error(`unknown domain: ${name}`);
		}

		this.service?.close();
		this.service = undefined;
		this.context = undefined;
		this.domain = name;
		const ctx = this.loadContext(name);
		this.terminal.writeln(
			colorize(TERMINAL.scannerOk, `domain set: ${ctx.displayName} (${name})`),
		);
		await this.printDomainBanner(name);
	}

	private async listDomains(): Promise<void> {
		await this.ensureDomainsLoaded();
		const names = this.registry.list();
		if (names.length === 0) {
			this.terminal.writeln(colorize(TERMINAL.scannerDim, '(no domains loaded)'));
			return;
		}
		for (const name of names) {
			const config = this.registry.get(name);
			const label = domainDisplayName(config);
			const marker = name === this.domain ? '*' : ' ';
			this.terminal.writeln(
				colorize(
					name === this.domain ? TERMINAL.scannerOk : TERMINAL.scannerDim,
					`${marker} ${label}`,
				),
			);
			this.terminal.writeln(colorize(TERMINAL.scannerDim, `    ${name}`));
		}
	}

	private loadContext(domainName: string): DomainContext {
		const config = this.registry.get(domainName);
		this.context = createDomainContext(config);
		return this.context;
	}

	private activeContext(): DomainContext {
		const domainName = this.resolveDomain();
		if (this.context && this.domain === domainName) {
			return this.context;
		}
		return this.loadContext(domainName);
	}

	private async promptForActiveDomain(): Promise<string> {
		if (!this.domain) return 'sp> ';
		await this.ensureDomainsLoaded();
		return this.activeContext().promptLabel();
	}

	private async printDomainBanner(domainName: string): Promise<void> {
		const ctx = this.loadContext(domainName);
		const lines = ctx.bannerLines();
		ctx.say(this.terminal, 'primary', lines[0] ?? ctx.displayName);
		for (const line of lines.slice(1)) {
			this.terminal.writeln(colorize(TERMINAL.scannerDim, line));
		}
	}

	private resolveDomain(name?: string): string {
		const resolved = name ?? this.domain;
		if (!resolved) {
			throw new Error('no domain selected; use: domain <name>');
		}
		return resolved;
	}

	private async getService(domainName: string): Promise<Service> {
		if (this.service && this.domain === domainName) {
			return this.service;
		}

		const service = new Service(this.registry, domainName);
		await service.initialize();
		this.service = service;
		this.domain = domainName;
		return service;
	}

	private async showStatus(domainArg?: string): Promise<void> {
		await this.ensureDomainsLoaded();
		const domainName = this.resolveDomain(domainArg);
		const config = this.registry.get(domainName);

		const ctx = createDomainContext(config);
		const lines = [
			`display: ${ctx.displayName}`,
			`domain: ${config.domain}`,
			`service: ${ctx.serviceName}`,
			`csrf: ${config.csrf.enabled ? 'enabled' : 'disabled'}`,
			`supply-chain: ${config.supplyChain.enabled ? 'enabled' : 'disabled'}`,
			`interactive: ${config.service?.interactive ? 'yes' : 'no'}`,
			`audit: ${config.audit?.sqlite?.path ?? '(none)'}`,
			`secrets: ${config.secrets.inventory.length} inventoried`,
		];

		ctx.say(this.terminal, 'info', lines[0] ?? ctx.displayName);
		for (const line of lines.slice(1)) {
			this.terminal.writeln(colorize(TERMINAL.scannerInfo, line));
		}
	}

	private async showColors(): Promise<void> {
		await this.ensureDomainsLoaded();
		const ctx = this.activeContext();
		for (const swatch of ctx.colorSwatches()) {
			this.terminal.writeln(ctx.formatSwatch(swatch));
		}
	}

	private flagValue(args: string[], flag: string): string | undefined {
		const index = args.indexOf(flag);
		return index >= 0 ? args[index + 1] : undefined;
	}

	private async runAuditThumbnail(args: string[]): Promise<void> {
		const id = this.flagValue(args, '--id');
		const input = this.flagValue(args, '--input');
		if (!id || !input) {
			throw new Error('usage: audit thumbnail --id <id> --input <path>');
		}

		const domainName = this.resolveDomain();
		const service = await this.getService(domainName);
		const resolved = path.resolve(input);
		const enriched = await service.generateAuditThumbnailForEntry(id, resolved, {
			imagePath: resolved,
		});
		this.terminal.writeln(
			colorize(
				TERMINAL.scannerOk,
				`audit thumbnail → ${enriched.visual?.thumbnailPath ?? '(none)'}`,
			),
		);
	}

	private async runQr(args: string[]): Promise<void> {
		const text = this.flagValue(args, '--text');
		const output = this.flagValue(args, '--output') ?? this.flagValue(args, '--out');
		const format = this.flagValue(args, '--format');
		const sizeRaw = this.flagValue(args, '--size');
		const dark = this.flagValue(args, '--dark');
		const light = this.flagValue(args, '--light');
		const terminal = args.includes('--terminal') || (!text && !output && !format);

		if (text) {
			if (!output) {
				throw new Error('usage: qr --text <value> --out <path>');
			}

			const domainName = this.resolveDomain();
			const service = await this.getService(domainName);
			const dest = path.resolve(output);
			await service.generateTokenQR(text, dest);
			this.terminal.writeln(colorize(TERMINAL.scannerOk, `qr → ${dest}`));
			return;
		}

		const domainName = this.resolveDomain();
		const size = sizeRaw ? Number(sizeRaw) : undefined;
		if (sizeRaw && (!Number.isFinite(size) || size! <= 0)) {
			throw new Error('--size must be a positive number');
		}

		const result = await runDomainQr({
			domain: domainName,
			output,
			terminal,
			format,
			size,
			dark,
			light,
			registry: this.registry,
		});

		printDomainQrMessages(domainQrMessages(result), {
			log: line => this.terminal.writeln(line),
			logErr: line => this.terminal.writeln(line),
		}, 'qr');
	}

	private async runTls(args: string[]): Promise<void> {
		const host =
			this.flagValue(args, '--host') ?? args.find(token => !token.startsWith('--'));
		if (!host) {
			throw new Error(
				'usage: tls --host <hostname> [--port N] [--use-system-ca|--no-use-system-ca] [--deep]',
			);
		}

		const portRaw = this.flagValue(args, '--port');
		const port = portRaw ? Number(portRaw) : undefined;
		if (portRaw && (!Number.isFinite(port) || port! <= 0)) {
			throw new Error('--port must be a positive number');
		}

		let useSystemCA: boolean | undefined;
		if (args.includes('--no-use-system-ca')) {
			useSystemCA = false;
		} else if (args.includes('--use-system-ca')) {
			useSystemCA = true;
		}

		const domainName = this.resolveDomain();
		const profile = await runTlsScan({
			domain: domainName,
			host,
			port,
			useSystemCA,
			deep: args.includes('--deep'),
			registry: this.registry,
		});

		printTlsProfileTo(profile, line => this.terminal.writeln(line), 'tls');
	}

	private async runReportImage(args: string[]): Promise<void> {
		if (args.includes('--qr')) {
			await this.runReportWithOperatorQr(args);
			return;
		}

		if (!args.includes('--image')) {
			throw new Error(
				'usage: report --image --html <path> [--output <path>] | report --qr [--output path]',
			);
		}

		const htmlPath = this.flagValue(args, '--html');
		if (!htmlPath) {
			throw new Error('usage: report --image --html <path> [--output <path>]');
		}

		const output = this.flagValue(args, '--output') ?? this.flagValue(args, '--out');
		const html = await Bun.file(path.resolve(htmlPath)).text();
		const domainName = this.resolveDomain();
		const service = await this.getService(domainName);
		const result = await service.generateReportImage(html, {
			outputPath: output ? path.resolve(output) : undefined,
		});
		this.terminal.writeln(colorize(TERMINAL.scannerOk, `report image → ${result.path}`));
	}

	private async runReportWithOperatorQr(args: string[]): Promise<void> {
		const output =
			this.flagValue(args, '--output') ?? this.flagValue(args, '--out') ?? 'report.html';
		const domainName = this.resolveDomain();
		const service = await this.getService(domainName);
		const html = await service.generateOperatorReportHtml({
			generatedAt: new Date().toISOString(),
			feedSource: 'shell',
			riskScore: 0,
			fatalCount: 0,
			warnCount: 0,
			infoCount: 0,
			advisories: [],
			overrides: [],
			dryRun: false,
			project: domainName,
		});

		const dest = path.resolve(output);
		await Bun.write(dest, html);
		this.terminal.writeln(colorize(TERMINAL.scannerOk, `report with operator QR → ${dest}`));
	}

	private async writeBadge(args: string[]): Promise<void> {
		await this.ensureDomainsLoaded();
		const ctx = this.activeContext();
		const sizeIndex = args.indexOf('--size');
		const sizeRaw = sizeIndex >= 0 ? args[sizeIndex + 1] : undefined;
		const size = sizeRaw ? Number(sizeRaw) : 48;
		if (!Number.isFinite(size) || size <= 0) {
			throw new Error('usage: badge [--size <pixels>]');
		}

		const badgePath = await ctx.writeBadge({size});
		ctx.say(this.terminal, 'success', ctx.describeBadge(badgePath, size));
	}

	private showFeatures(): void {
		for (const name of ALL_FEATURES) {
			const enabled = FEATURES[name];
			const state = enabled
				? colorize(TERMINAL.scannerOk, 'enabled')
				: colorize(TERMINAL.scannerWarn, 'disabled');
			this.terminal.writeln(colorize(TERMINAL.scannerDim, `  ${name}: ${state}`));
		}
	}

	private showProfiles(): void {
		for (const name of PROFILE_NAMES) {
			const features = PROFILES[name].join(', ');
			this.terminal.writeln(
				colorize(TERMINAL.scannerInfo, `  ${name}: ${profileDescription(name)}`),
			);
			this.terminal.writeln(colorize(TERMINAL.scannerDim, `    features: ${features}`));
		}
	}

	private async runScan(args: string[]): Promise<void> {
		if (!FEATURE_SCAN_EXTERNAL) {
			throw new Error('SCAN_EXTERNAL is disabled in this build');
		}

		const domainName = this.resolveDomain();
		const service = await this.getService(domainName);
		const tool = args[0] ?? 'trivy';
		const toolArgs = args.slice(1);

		const config = this.registry.get(domainName);
		if (!config.service?.interactive) {
			throw new Error(
				`interactive scanning disabled for ${domainName}; set service.interactive: true`,
			);
		}

		const runner = new ToolRunner();
		const result = await runner.runOnTerminal(tool, this.sharedTerminal, {
			args: toolArgs.length > 0 ? toolArgs : ['filesystem', '--scanners', 'vuln'],
			stdin: true,
		});

		await service.audit({
			id: crypto.randomUUID(),
			package: tool,
			version: result.exitCode === 0 ? 'ok' : 'failed',
			requestedRange: '*',
			advisories: [],
			allowed: result.exitCode === 0,
			decidedAt: new Date().toISOString(),
		});

		if (result.exitCode !== 0) {
			throw new Error(`${tool} exited with code ${result.exitCode}`);
		}
	}

	private async handleAudit(args: string[]): Promise<void> {
		if (args[0] === 'thumbnail') {
			await this.runAuditThumbnail(args.slice(1));
			return;
		}

		if (args[0] !== 'tail') {
			throw new Error('usage: audit tail [--follow] | audit thumbnail --id <id> --input <path>');
		}

		const follow = args.includes('--follow');
		const domainName = this.resolveDomain();
		const service = await this.getService(domainName);
		await this.tailAuditLog(service, follow);
	}

	private printAuditEntries(entries: import('../audit/types.ts').AuditEntry[]): void {
		for (const entry of entries) {
			this.terminal.writeln(JSON.stringify(entry));
		}
	}

	private stopTail(): void {
		this.tailAbort?.abort();
		this.tailAbort = undefined;
	}

	private async tailAuditLog(service: Service, follow: boolean): Promise<void> {
		const entries = await service.readAuditEntries();
		this.printAuditEntries(entries);

		if (!follow) {
			if (entries.length === 0) {
				this.terminal.writeln(colorize(TERMINAL.scannerDim, '(no audit entries)'));
			}
			return;
		}

		let seen = entries.length;
		this.stopTail();
		this.tailAbort = new AbortController();
		const {signal} = this.tailAbort;

		this.terminal.writeln(
			colorize(TERMINAL.scannerDim, 'Following audit log (Ctrl+C to stop)…'),
		);

		const onSigint = () => this.stopTail();
		process.on('SIGINT', onSigint);
		process.on('SIGTERM', onSigint);

		try {
			await new Promise<void>(resolve => {
				const interval = setInterval(async () => {
					if (signal.aborted) return;
					try {
						const latest = await service.readAuditEntries();
						const fresh = latest.slice(seen);
						if (fresh.length > 0) {
							this.printAuditEntries(fresh);
						}
						seen = latest.length;
					} catch {
						// ignore transient read errors while tailing
					}
				}, 1000);

				signal.addEventListener(
					'abort',
					() => {
						clearInterval(interval);
						resolve();
					},
					{once: true},
				);
			});
		} finally {
			process.off('SIGINT', onSigint);
			process.off('SIGTERM', onSigint);
		}

		this.terminal.writeln(colorize(TERMINAL.scannerDim, 'Stopped following audit log.'));
	}

	private async runBuild(args: string[]): Promise<void> {
		const profileIndex = args.indexOf('--profile');
		const profileName = profileIndex >= 0 ? args[profileIndex + 1] : undefined;

		if (!profileName || !isBuildProfile(profileName)) {
			throw new Error(`usage: build --profile <${PROFILE_NAMES.join('|')}>`);
		}

		const result = await this.buildProfile(profileName);
		if (result.exitCode !== 0) {
			throw new Error(`build failed with exit code ${result.exitCode}`);
		}

		this.terminal.writeln(colorize(TERMINAL.scannerOk, `[build] wrote ${result.outdir}`));
	}

	/**
	 * Build a deployment bundle for the given profile.
	 */
	async buildProfile(profile: BuildProfile): Promise<BuildShellResult> {
		const features = profileFeatures(profile);
		const enabled = new Set(features);
		const featureArgs = buildFeatureArgs(enabled);
		const outdir = path.join(this.outdir, profile);

		const buildArgs = [
			'build',
			'--target=bun',
			`--outdir=${outdir}`,
			...featureArgs,
			this.entry,
		];

		this.terminal.writeln(
			colorize(TERMINAL.scannerInfo, `[build] profile=${profile} — ${profileDescription(profile)}`),
		);
		this.terminal.writeln(colorize(TERMINAL.scannerDim, `[build] bun ${buildArgs.join(' ')}`));

		const {exitCode} = await spawnInherit(['bun', ...buildArgs]);
		return {profile, features, outdir, exitCode};
	}

	private async handleSecrets(args: string[]): Promise<void> {
		await this.ensureDomainsLoaded();
		const ctx = this.activeContext();
		const sub = args[0]?.toLowerCase();
		const showStatus = sub === 'status' || sub === undefined;

		if (ctx.config.secrets.inventory.length === 0) {
			this.terminal.writeln(colorize(TERMINAL.scannerDim, '(no secrets in inventory)'));
			return;
		}

		ctx.say(this.terminal, 'vault', `vault service: ${ctx.serviceName}`);

		let statuses: Awaited<ReturnType<ConfigVault['status']>> = [];
		if (showStatus) {
			try {
				statuses = await ctx.vault.status();
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.terminal.writeln(colorize(TERMINAL.scannerWarn, `vault: ${message}`));
			}
		}

		for (const secret of ctx.config.secrets.inventory) {
			const status = statuses.find(entry => entry.name === secret.name);
			const state =
				status === undefined
					? ''
					: status.exists
						? colorize(TERMINAL.scannerOk, 'present')
						: colorize(TERMINAL.scannerWarn, 'missing');
			const required = secret.required ? colorize(TERMINAL.fatal, 'required') : 'optional';
			const line = `  ${secret.name} ${state} [${required}] — ${secret.description ?? 'no description'}`;
			ctx.say(this.terminal, 'vault', line);
		}
	}
}