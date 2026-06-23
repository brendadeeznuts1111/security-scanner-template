import type {DomainConfig} from '../config/types.ts';
import {FEATURE_AUDIT_SQLITE, FEATURE_INTEL_DNS} from '../features/index.ts';
import {PasswordHasher} from '../identity/password.ts';
import {CSRFGuard} from '../csrf/guard.ts';
import {DNSThreatChecker} from '../intel/dns-threat.ts';
import {AuditSink} from '../audit/sqlite-sink.ts';
import {EncryptedSQLiteSink} from '../audit/encrypted-sqlite-sink.ts';
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

		const sqliteConfig = config.audit?.sqlite;
		if (FEATURE_AUDIT_SQLITE && sqliteConfig && options.auditMasterKey) {
			this.audit = new AuditSink(sqliteConfig.path, options.auditMasterKey, {
				compress: sqliteConfig.compress,
				compressionFormat: sqliteConfig.compressionFormat,
			});
		}
	}

	static async create(
		config: DomainConfig,
		registry: Registry,
		options: DomainOptions = {},
	): Promise<Domain> {
		const sqliteConfig = config.audit?.sqlite;
		if (FEATURE_AUDIT_SQLITE && sqliteConfig?.path) {
			await EncryptedSQLiteSink.ensureParentDir(sqliteConfig.path);
		}
		return new Domain(config, registry, options);
	}

	close(): void {
		this.audit?.close();
	}
}
