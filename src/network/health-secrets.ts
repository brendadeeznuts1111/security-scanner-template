import {createHash} from 'crypto';
import {colorize, TERMINAL} from '../color/index.ts';
import {detectSecretsBackend} from '../secrets-backend.ts';

export interface HealthUrlSecretRef {
	service: string;
	name: string;
	raw: string;
}

export interface HealthUrlResolution {
	url: string | null;
	source: 'literal' | 'secret' | 'none';
	secretRef?: HealthUrlSecretRef;
	backend?: string;
	platform?: string;
	channel: 'vault';
}

/** Domain-scoped Bun.secrets service namespace for health URLs. */
export function networkHealthSecretService(domain: string): string {
	return `supply-chain-${domain}`;
}

/** Redacted log label — never includes secret value. */
export function formatSecretLogLabel(secretName: string): string {
	const hash = createHash('sha256').update(secretName).digest('hex').slice(0, 12);
	return `[secret:${secretName} (sha256:${hash})]`;
}

/**
 * Resolve health URL secret name for a domain.
 * CLI `--health-url-secret health/prod` → service `supply-chain-{domain}`, name `health/prod`.
 */
export function resolveHealthSecretRef(domain: string, secretSpec: string): HealthUrlSecretRef {
	const trimmed = secretSpec.trim();
	return {
		service: networkHealthSecretService(domain),
		name: trimmed,
		raw: trimmed,
	};
}

/**
 * Resolve a health probe URL from literal or Bun.secrets (domain-scoped).
 * Secret values are never logged — only hashed identifiers.
 */
export async function resolveHealthUrl(options: {
	healthUrl?: string;
	healthUrlSecret?: string;
	domain?: string;
	domainService?: string;
}): Promise<HealthUrlResolution> {
	if (options.healthUrl?.trim()) {
		return {url: options.healthUrl.trim(), source: 'literal', channel: 'vault'};
	}

	if (!options.healthUrlSecret?.trim() || !options.domain) {
		return {url: null, source: 'none', channel: 'vault'};
	}

	const secretRef = resolveHealthSecretRef(options.domain, options.healthUrlSecret);
	const backend = await detectSecretsBackend();

	if (typeof Bun.secrets === 'undefined') {
		logSecretChannel(
			`[secrets] Bun.secrets unavailable — cannot resolve ${formatSecretLogLabel(secretRef.name)}`,
			backend.platform,
		);
		return {url: null, source: 'secret', secretRef, ...backend, channel: 'vault'};
	}

	try {
		const value = await Bun.secrets.get({
			service: secretRef.service,
			name: secretRef.name,
		});
		const isolation = backend.platform === 'win32' ? ' enterprise-credential-isolation' : '';
		logSecretChannel(
			`[secrets] resolved ${formatSecretLogLabel(secretRef.name)} via ${backend.backend}${isolation}`,
			backend.platform,
		);
		return {
			url: value,
			source: 'secret',
			secretRef,
			...backend,
			channel: 'vault',
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logSecretChannel(
			`[secrets] failed ${formatSecretLogLabel(secretRef.name)}: ${message}`,
			backend.platform,
		);
		return {url: null, source: 'secret', secretRef, ...backend, channel: 'vault'};
	}
}

function logSecretChannel(message: string, _platform?: string): void {
	console.error(colorize(TERMINAL.primary, message));
}
