import type {DomainConfig} from '../config/types.ts';
import {FEATURE_INTEL_DNS} from '../features/index.ts';
import {PasswordHasher} from '../identity/password.ts';
import {CSRFGuard} from '../csrf/guard.ts';
import {DNSThreatChecker} from '../intel/dns-threat.ts';
import type {AuditSink} from '../audit/types.ts';
import {
	createDomainAuditSink,
	ensureDomainAuditParentDir,
	resolveDomainAuditMasterKey,
} from './audit-paths.ts';
import type {Registry} from '../registry/index.ts';

export type {DomainConfig};

export interface DomainOptions {
	csrfSecret?: string;
	auditMasterKey?: string;
}

export class Domain {
	readonly config: DomainConfig;
	readonly registry: Registry;
	readonly password?: PasswordHasher;
	readonly csrf?: CSRFGuard;
	readonly dns?: DNSThreatChecker;
	readonly audit?: AuditSink;

	constructor(config: DomainConfig, registry: Registry, options: DomainOptions = {}) {
		this.config = config;
		this.registry = registry;

		if (config.identity) {
			this.password = new PasswordHasher(config.identity);
		}

		if (config.csrf && config.csrf.enabled && options.csrfSecret) {
			this.csrf = new CSRFGuard(options.csrfSecret, config.csrf);
		}

		if (FEATURE_INTEL_DNS && config.intel?.dns) {
			this.dns = new DNSThreatChecker(config.intel.dns);
		}

		const masterKey = options.auditMasterKey ?? resolveDomainAuditMasterKey(config);
		if (masterKey) {
			this.audit = createDomainAuditSink(config, masterKey) ?? undefined;
		}
	}

	static async create(
		config: DomainConfig,
		registry: Registry,
		options: DomainOptions = {},
	): Promise<Domain> {
		await ensureDomainAuditParentDir(config);
		return new Domain(config, registry, options);
	}

	close(): void {
		const sink = this.audit as AuditSink & {close?: () => void};
		sink?.close?.();
	}
}
