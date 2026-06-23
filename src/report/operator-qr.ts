import {resolveDomainMasterKeyNames, resolveDomainMasterToken} from '../cli/qr.ts';
import type {DomainRegistry} from '../config/registry.ts';
import {domainServiceName} from '../domain/branding.ts';
import {QRGenerator} from '../visual/qr.ts';
import {qrCacheKeyPair} from '../visual/qr-cache.ts';
import type {ReportOperatorQr} from './types.ts';

export interface BuildOperatorQrOptions {
	size?: number;
	dark?: string;
	light?: string;
	root?: string;
}

/**
 * Build an operator QR data URL for a domain vault master token.
 * Returns null when Bun.secrets has no master key for the domain.
 */
export async function buildOperatorQrForDomain(
	registry: DomainRegistry,
	domain: string,
	options: BuildOperatorQrOptions = {},
): Promise<ReportOperatorQr | null> {
	await registry.loadAll();
	if (!registry.has(domain)) {
		return null;
	}

	const config = registry.get(domain);
	const serviceName = domainServiceName(config);
	const secretNames = await resolveDomainMasterKeyNames(domain, options.root);
	const resolved = await resolveDomainMasterToken(serviceName, secretNames);
	if (!resolved) {
		return null;
	}

	const dataUrl = await QRGenerator.generate(resolved.token, {
		size: options.size ?? 180,
		dark: options.dark,
		light: options.light,
	});

	return {
		domain,
		dataUrl,
		label: 'Domain vault operator QR',
		cacheKey: qrCacheKeyPair(domain, resolved.token).key,
	};
}
