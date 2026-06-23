import path from 'path';
import type {DomainConfig, DomainServiceTls} from '../config/types.ts';

export interface ServiceTlsOptions {
	cert: string;
	key: string;
	ca?: string;
}

export interface ServiceOptions {
	port?: number;
	hostname?: string;
	http3?: boolean;
	http1?: boolean;
	tls?: ServiceTlsOptions;
}

export interface ResolvedServeOptions {
	port?: number;
	hostname?: string;
	http3: boolean;
	http1: boolean;
	tls?: ServiceTlsOptions;
}

function resolveTlsPath(value: string): string {
	return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function resolveTls(tls: DomainServiceTls | ServiceTlsOptions): ServiceTlsOptions {
	return {
		cert: resolveTlsPath(tls.cert),
		key: resolveTlsPath(tls.key),
		ca: tls.ca ? resolveTlsPath(tls.ca) : undefined,
	};
}

/**
 * Merge CLI/runtime overrides with domain `service` config for Bun.serve.
 */
export function resolveServeOptions(
	config: DomainConfig,
	overrides: ServiceOptions = {},
): ResolvedServeOptions {
	const svc = config.service ?? {};

	return {
		port: overrides.port ?? svc.port,
		hostname: overrides.hostname ?? svc.hostname,
		http3: overrides.http3 ?? svc.http3 ?? false,
		http1: overrides.http1 ?? svc.http1 ?? true,
		tls: overrides.tls
			? resolveTls(overrides.tls)
			: svc.tls
				? resolveTls(svc.tls)
				: undefined,
	};
}

/**
 * Build Bun.serve options from resolved service settings.
 */
export function buildServeInit(
	resolved: ResolvedServeOptions,
	fetch: (req: Request) => Response | Promise<Response>,
): {
	port?: number;
	hostname?: string;
	http3?: boolean;
	http1?: boolean;
	tls?: ServiceTlsOptions;
	fetch: (req: Request) => Response | Promise<Response>;
} {
	const init: ReturnType<typeof buildServeInit> = {
		fetch,
		http1: resolved.http1,
	};

	if (resolved.port !== undefined) init.port = resolved.port;
	if (resolved.hostname !== undefined) init.hostname = resolved.hostname;
	if (resolved.http3) init.http3 = true;
	if (resolved.tls) init.tls = resolved.tls;

	return init;
}