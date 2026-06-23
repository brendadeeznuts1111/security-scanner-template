import type {DomainConfig, SecretEntry} from '../config/types.ts';
import type {VaultStatusEntry} from '../domains/vault.ts';
import {resolveSecretsService} from './secrets-service.ts';

export interface ConfigSecretSpec {
	service: string;
	name: string;
	required: boolean;
	description: string;
	allowUnrestrictedAccess: boolean;
}

function toSpec(config: DomainConfig, entry: SecretEntry): ConfigSecretSpec {
	return {
		service: resolveSecretsService(config),
		name: entry.name,
		required: entry.required,
		description: entry.description ?? '',
		allowUnrestrictedAccess: config.secrets.allowUnrestrictedAccess,
	};
}

/**
 * Vault operations scoped to a loaded domain config (inventory + service name).
 */
export class ConfigVault {
	constructor(private readonly config: DomainConfig) {}

	get serviceName(): string {
		return resolveSecretsService(this.config);
	}

	listInventory(): ConfigSecretSpec[] {
		return this.config.secrets.inventory.map(entry => toSpec(this.config, entry));
	}

	private ensureSecretsApi(): void {
		if (typeof Bun.secrets === 'undefined') {
			throw new Error('Bun.secrets is not available in this Bun runtime');
		}
	}

	async status(): Promise<VaultStatusEntry[]> {
		this.ensureSecretsApi();
		const specs = this.listInventory();

		return Promise.all(
			specs.map(async spec => {
				const value = await Bun.secrets.get({service: spec.service, name: spec.name});
				return {
					service: spec.service,
					name: spec.name,
					exists: value !== null,
					required: spec.required,
				};
			}),
		);
	}

	async has(name: string): Promise<boolean> {
		this.ensureSecretsApi();
		const spec = this.listInventory().find(entry => entry.name === name);
		if (!spec) {
			throw new Error(`Unknown secret "${name}" for domain ${this.config.domain}`);
		}
		const value = await Bun.secrets.get({service: spec.service, name: spec.name});
		return value !== null;
	}
}

export function createConfigVault(config: DomainConfig): ConfigVault {
	return new ConfigVault(config);
}