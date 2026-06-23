import type {DomainConfig} from '../config/types.ts';
import type {SupplyChainConfig} from '../domains/supply-chain.ts';
import {
	resolveDomainAudit,
	resolveDomainAuditMasterKey,
	resolveDomainAuditPath,
} from './audit-paths.ts';

/**
 * Map a loaded domain config to supply-chain `activate()` audit options.
 */
export function domainSupplyChainAuditOptions(
	config: DomainConfig,
	envKey: string | undefined = process.env.AUDIT_MASTER_KEY,
): Pick<SupplyChainConfig, 'auditLog' | 'auditMasterKey' | 'auditCompress'> {
	const resolved = resolveDomainAudit(config);
	if (!resolved) {
		return {};
	}

	const masterKey = resolveDomainAuditMasterKey(config, envKey);
	const options: Pick<SupplyChainConfig, 'auditLog' | 'auditMasterKey' | 'auditCompress'> = {
		auditLog: resolved.path,
		auditCompress: resolved.options.compress ?? resolved.kind === 'sqlite',
	};
	if (masterKey) {
		options.auditMasterKey = masterKey;
	}
	return options;
}

/**
 * Build a full `SupplyChainConfig` from domain config for watch/install hooks.
 */
export function supplyChainConfigFromDomain(
	config: DomainConfig,
	patch: SupplyChainConfig = {},
): SupplyChainConfig {
	return {
		domain: config.domain,
		feed: config.supplyChain.feed,
		policy: config.supplyChain.policy,
		...domainSupplyChainAuditOptions(config),
		...patch,
	};
}

export {resolveDomainAuditPath};
