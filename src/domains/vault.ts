import {getDomainSecrets, getSecretSpec, type DomainSecret} from './registry.ts';
import {secretsServiceForDomain} from '../domain/secrets-service.ts';

export interface VaultStatusEntry {
	/** Bun.secrets service namespace (reverse-DNS domain). */
	service: string;
	name: string;
	exists: boolean;
	required: boolean;
}

/**
 * Per-domain vault that reads and writes secrets through the OS credential
 * store via Bun.secrets. The service name is always the reverse-DNS domain,
 * so secrets from different domains cannot collide.
 */
export class VaultDomain {
	constructor(private readonly domain: string) {}

	get serviceName(): string {
		return secretsServiceForDomain(this.domain);
	}

	private spec(name: string): DomainSecret {
		return getSecretSpec(this.domain, name);
	}

	/**
	 * Read a secret. Returns the empty string for optional secrets that are
	 * missing; required missing secrets throw.
	 */
	async get(name: string): Promise<string> {
		const spec = this.spec(name);

		if (typeof Bun.secrets === 'undefined') {
			throw new Error('Bun.secrets API is not available in this runtime');
		}

		const value = await Bun.secrets.get({service: spec.service, name: spec.name});

		if (value === null && spec.required) {
			throw new Error(`Required secret missing: ${spec.service}/${spec.name}`);
		}

		return value ?? '';
	}

	/**
	 * Store a secret. The credential flag is taken from the registry.
	 */
	async set(name: string, value: string): Promise<void> {
		const spec = this.spec(name);

		if (typeof Bun.secrets === 'undefined') {
			throw new Error('Bun.secrets API is not available in this runtime');
		}

		await Bun.secrets.set({
			service: spec.service,
			name: spec.name,
			value,
			allowUnrestrictedAccess: spec.allowUnrestrictedAccess,
		});
	}

	/**
	 * Delete a secret. Returns true if a credential was removed.
	 */
	async delete(name: string): Promise<boolean> {
		const spec = this.spec(name);

		if (typeof Bun.secrets === 'undefined') {
			throw new Error('Bun.secrets API is not available in this runtime');
		}

		return Bun.secrets.delete({service: spec.service, name: spec.name});
	}

	/**
	 * List all secrets for this domain with their existence status.
	 */
	async status(): Promise<VaultStatusEntry[]> {
		const secrets = getDomainSecrets(this.domain);

		if (typeof Bun.secrets === 'undefined') {
			throw new Error('Bun.secrets API is not available in this runtime');
		}

		return Promise.all(
			secrets.map(async spec => {
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
}

/**
 * Convenience factory for the registered domains.
 */
export function createVaultDomain(domain: string): VaultDomain {
	return new VaultDomain(domain);
}
