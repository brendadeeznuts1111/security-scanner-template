#!/usr/bin/env bun
import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import {domainRegistry, type DomainRegistry} from '../config/registry.ts';
import {resolveUseSystemCA, TLSInspector, type TLSProfile} from '../intel/tls/index.ts';
import {cliBoolean, cliString} from '../utils/cli.ts';
import {isMainModule} from '../utils/runtime.ts';

export interface TlsScanCliOptions {
	domain?: string;
	host?: string;
	port?: number;
	useSystemCA?: boolean;
	deep?: boolean;
	json?: boolean;
	registry?: DomainRegistry;
}

export type TlsProfileWriter = (line: string) => void;

export function printTlsProfileTo(
	profile: TLSProfile,
	writeln: TlsProfileWriter,
	prefix = '[tls]',
): void {
	writeln(colorize(TERMINAL.scannerInfo, `${prefix} ${profile.host}:${profile.port}`));

	if (profile.protocol) {
		writeln(`  Protocol: ${profile.protocol}`);
	}
	if (profile.alpn !== undefined) {
		writeln(`  ALPN: ${profile.alpn || '(none)'}`);
	}
	if (profile.cipher) {
		writeln(`  Cipher: ${profile.cipher.standardName ?? profile.cipher.name}`);
	}

	if (profile.validatedWithSystemCA) {
		const mark = profile.trusted
			? colorize(TERMINAL.scannerOk, 'yes')
			: colorize(TERMINAL.scannerFatal, 'no');
		writeln(`  Trusted (system CA): ${mark}`);
		if (!profile.trusted && profile.trustError) {
			writeln(`  Trust error: ${profile.trustError}`);
		}
	} else {
		writeln(
			colorize(
				TERMINAL.scannerDim,
				'  Trusted (system CA): skipped (empty OS store or tls.useSystemCA: false)',
			),
		);
	}

	if (profile.certificate) {
		const cert = profile.certificate;
		const subject = cert.subject.CN ?? Object.values(cert.subject)[0] ?? '(unknown)';
		const issuer = cert.issuer.CN ?? Object.values(cert.issuer)[0] ?? '(unknown)';
		writeln(`  Subject: ${subject}`);
		writeln(`  Issuer: ${issuer}`);
		writeln(`  Valid: ${cert.validFrom} → ${cert.validTo} (${cert.daysRemaining}d)`);
		writeln(`  Fingerprint: ${cert.fingerprint}`);
		if (cert.expired) {
			writeln(colorize(TERMINAL.scannerFatal, '  Certificate expired'));
		}
		if (cert.selfSigned) {
			writeln(colorize(TERMINAL.scannerWarn, '  Self-signed certificate'));
		}
	}

	if (profile.chain && profile.chain.length > 1) {
		writeln(`  Chain: ${profile.chain.length} certificate(s)`);
	}
}

export function printTlsProfile(profile: TLSProfile, prefix = '[tls]'): void {
	printTlsProfileTo(profile, line => console.log(line), prefix);
}

/**
 * Resolve TLS scan options from CLI flags and optional domain config.
 */
export async function runTlsScan(options: TlsScanCliOptions): Promise<TLSProfile> {
	const host = options.host?.trim();
	if (!host) {
		throw new Error('--host is required');
	}

	let domainTlsUseSystemCA: boolean | undefined;

	if (options.domain) {
		const registry = options.registry ?? domainRegistry;
		await registry.loadAll();
		if (!registry.has(options.domain)) {
			throw new Error(`unknown domain: ${options.domain}`);
		}

		const config = registry.get(options.domain);
		domainTlsUseSystemCA = config.tls?.useSystemCA;
	}

	const useSystemCA = resolveUseSystemCA(options.useSystemCA, domainTlsUseSystemCA);

	const port = options.port ?? 443;
	if (!Number.isFinite(port) || port <= 0) {
		throw new Error('--port must be a positive number');
	}

	return TLSInspector.inspect(host, port, {
		useSystemCA,
		deep: options.deep,
	});
}

export async function runTlsCli(options: TlsScanCliOptions): Promise<number> {
	try {
		const profile = await runTlsScan(options);

		if (options.json) {
			console.log(JSON.stringify(profile, null, 2));
		} else {
			printTlsProfile(profile, options.domain ? `[sp] tls` : '[tls]');
		}

		if (profile.validatedWithSystemCA && profile.trusted === false) {
			return 1;
		}
		if (profile.certificate?.expired) {
			return 1;
		}
		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(colorize(TERMINAL.scannerFatal, `[tls] ${message}`));
		return 1;
	}
}

async function main(): Promise<void> {
	const parsed = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			'domain': {type: 'string'},
			'host': {type: 'string'},
			'port': {type: 'string'},
			'use-system-ca': {type: 'boolean'},
			'no-use-system-ca': {type: 'boolean'},
			'deep': {type: 'boolean'},
			'json': {type: 'boolean'},
			'help': {type: 'boolean', short: 'h'},
		},
		strict: false,
		allowPositionals: true,
	});

	if (parsed.values.help) {
		console.log(`Usage:
  bun run tls --host <hostname> [--domain <reverse-dns>] [--port 443]
  bun sp tls --domain <reverse-dns> --host <hostname> [--use-system-ca] [--deep] [--json]

Inspect remote TLS endpoints. System CA validation runs automatically when
tls.getCACertificates('system') returns trust anchors (Bun >= 1.3.14).
On managed macOS, Bun >= 1.3.14 enumerates keychain CAs without network I/O.
Use --no-use-system-ca or domain \`tls.useSystemCA: false\` to skip.
Use --use-system-ca to force validation.`);
		process.exit(0);
	}

	const exitCode = await runTlsCli({
		domain: cliString(parsed.values.domain),
		host: cliString(parsed.values.host) ?? cliString(parsed.values.domain),
		port: cliString(parsed.values.port) ? Number(cliString(parsed.values.port)) : undefined,
		useSystemCA: cliBoolean(parsed.values['no-use-system-ca'])
			? false
			: cliBoolean(parsed.values['use-system-ca']),
		deep: cliBoolean(parsed.values.deep),
		json: cliBoolean(parsed.values.json),
	});
	process.exit(exitCode);
}

const __tlsCliMain =
	isMainModule() ||
	(process.argv[1]?.includes('tls.ts') ?? false) ||
	(Bun.argv[1]?.includes('tls.ts') ?? false);

if (__tlsCliMain) {
	await main();
}
