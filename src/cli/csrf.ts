import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import {createVaultDomain} from '../domains/vault.ts';
import {domainRegistry} from '../config/registry.ts';
import {isOsCredentialStoreAvailable} from '../secrets-backend.ts';
import {runCliIfMain} from '../utils/cli.ts';
import {randomUUIDv7} from '../utils/uuid.ts';

async function rotateCsrfSecret(domain: string): Promise<void> {
	const available = await isOsCredentialStoreAvailable();
	if (!available) {
		console.error(colorize(TERMINAL.scannerFatal, '[csrf] OS credential store is not available'));
		process.exit(1);
	}

	await domainRegistry.loadAll();

	if (!domainRegistry.has(domain)) {
		console.error(colorize(TERMINAL.scannerFatal, `[csrf] unknown domain: ${domain}`));
		process.exit(1);
	}

	const config = domainRegistry.get(domain);
	if (!config.csrf.enabled) {
		console.error(colorize(TERMINAL.scannerFatal, `[csrf] CSRF is disabled for domain ${domain}`));
		process.exit(1);
	}

	const secret = randomUUIDv7();
	const vault = createVaultDomain(domain);
	await vault.set('csrf-secret', secret);

	console.error(
		colorize(
			TERMINAL.scannerOk,
			`[csrf] rotated csrf-secret for ${domain} — all existing tokens are now invalid`,
		),
	);
}

async function main(): Promise<void> {
	const {values, positionals} = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			domain: {type: 'string'},
			help: {type: 'boolean', short: 'h'},
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(`Usage:
  bun run csrf rotate --domain <reverse-dns-domain>

Rotates the per-domain csrf-secret in Bun.secrets, invalidating all CSRF tokens.`);
		process.exit(0);
	}

	const command = positionals[0];

	if (command === 'rotate') {
		const domain = values.domain;
		if (!domain) {
			console.error(colorize(TERMINAL.scannerFatal, '[csrf] --domain is required'));
			process.exit(1);
		}

		await rotateCsrfSecret(domain);
		process.exit(0);
	}

	console.error(colorize(TERMINAL.scannerFatal, `[csrf] unknown command: ${command ?? '(none)'}`));
	process.exit(1);
}

await runCliIfMain(main, import.meta.path);
