#!/usr/bin/env bun
import {existsSync, mkdirSync, writeFileSync} from 'fs';
import path from 'path';
import {generateMasterKey, setMasterKey} from '../src/config/master-key.ts';
import {saveEncryptedStore} from '../src/config/encrypted-store.ts';
import type {SecretEntry} from '../src/config/types.ts';

const DOMAIN_GLOB = 'domains/*.security.json5';
const MASTER_KEY_NAME = 'vault-master-key';

interface JSON5 {
	parse: (text: string) => unknown;
	stringify: (value: unknown, replacer?: unknown, space?: string | number) => string;
}

// Bun exposes JSON5 as Bun.JSON5. Both parse and stringify are available at
// runtime; the bundled type currently only declares parse.
const json5 = Bun.JSON5 as JSON5;

interface PublicConfig {
	domain?: string;
	secrets?: {
		inventory?: SecretEntry[];
		inventoryFile?: string;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

export interface MigrateOptions {
	cwd?: string;
	silent?: boolean;
}

export interface MigrateResult {
	migrated: number;
	skipped: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getDomainName(publicPath: string, config: PublicConfig): string {
	if (typeof config.domain === 'string' && config.domain.length > 0) {
		return config.domain;
	}
	const match = publicPath.match(/domains\/(.+)\.security\.json5$/);
	return match?.[1] ?? 'unknown';
}

function log(silent: boolean, message: string): void {
	if (!silent) {
		console.log(message);
	}
}

export async function migrate(options: MigrateOptions = {}): Promise<MigrateResult> {
	const cwd = options.cwd ?? process.cwd();
	const silent = options.silent ?? false;

	const vaultDir = path.join(cwd, '.vault');
	if (!existsSync(vaultDir)) {
		mkdirSync(vaultDir, {recursive: true});
	}

	const glob = new Bun.Glob(DOMAIN_GLOB);
	const files = Array.from(glob.scanSync({cwd, absolute: true}));

	let migrated = 0;
	let skipped = 0;

	for (const publicPath of files) {
		const text = await Bun.file(publicPath).text();
		const config = json5.parse(text) as PublicConfig;
		const domainName = getDomainName(publicPath, config);

		const inlineInventory = config.secrets?.inventory;
		if (!Array.isArray(inlineInventory) || inlineInventory.length === 0) {
			log(silent, `✅ ${publicPath}: no inline inventory to migrate`);
			skipped++;
			continue;
		}

		const privatePath = path.join(cwd, '.vault', `${domainName}.inventory.json5`);
		const storePath = path.join(cwd, '.vault', `${domainName}.secrets.enc`);

		const masterKey = generateMasterKey();
		await setMasterKey({service: domainName, name: MASTER_KEY_NAME, value: masterKey});
		log(silent, `✅ Stored master key for ${domainName} in Bun.secrets`);

		await saveEncryptedStore(storePath, inlineInventory, masterKey);
		log(silent, `✅ Created encrypted store ${storePath}`);

		const privateData = {
			domain: domainName,
			version: 1,
			createdAt: new Date().toISOString(),
			masterKeyName: MASTER_KEY_NAME,
			encryptedStore: path.relative(path.dirname(privatePath), storePath),
		};

		writeFileSync(privatePath, json5.stringify(privateData, null, '\t'));
		log(silent, `✅ Created private inventory ${privatePath}`);

		// Remove only the inline inventory from the public file. Leave other
		// secrets settings (e.g., inventoryFile) intact.
		const updated = {...config};
		if (isPlainObject(updated.secrets)) {
			const restSecrets = {...updated.secrets};
			delete restSecrets.inventory;
			if (Object.keys(restSecrets).length === 0) {
				delete updated.secrets;
			} else {
				updated.secrets = restSecrets;
			}
		}

		writeFileSync(publicPath, json5.stringify(updated, null, '\t'));
		log(silent, `✅ Removed inline inventory from ${publicPath}`);
		migrated++;
	}

	// Ensure .vault/ is in .gitignore.
	const gitignorePath = path.join(cwd, '.gitignore');
	if (!existsSync(gitignorePath)) {
		writeFileSync(gitignorePath, '.vault/\n');
	} else {
		const gitignore = await Bun.file(gitignorePath).text();
		if (!gitignore.split('\n').some(line => line.trim() === '.vault/')) {
			await Bun.write(
				gitignorePath,
				gitignore.endsWith('\n') ? `${gitignore}.vault/\n` : `${gitignore}\n.vault/\n`,
			);
		}
	}

	log(
		silent,
		`\n🚀 Migration complete: ${migrated} migrated, ${skipped} skipped. Run \`bun run doctor\` to validate.`,
	);

	return {migrated, skipped};
}

if (import.meta.main) {
	await migrate();
}
