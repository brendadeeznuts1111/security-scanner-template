#!/usr/bin/env bun
import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import {
	deleteMasterKey,
	generateMasterKey,
	getMasterKey,
	setMasterKey,
} from '../config/master-key.ts';
import {secretsServiceForDomain} from '../domain/secrets-service.ts';

const SUBCOMMANDS = ['init', 'rotate', 'delete'] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

function isSubcommand(value: string): value is Subcommand {
	return SUBCOMMANDS.includes(value as Subcommand);
}

function printUsage(): void {
	console.error(`Usage: bun run master-key <subcommand> [options]

Subcommands:
  init    Generate and store a new master key for a domain
  rotate  Generate a new master key and re-encrypt the domain store
  delete  Remove a stored master key from the OS keychain

Options:
  --domain <domain>   Domain name (default: com.acme.bun-security-scanner)
  --name <name>       Master key name (default: vault-master-key)
  --json              Emit JSON instead of human-readable output
`);
}

async function main(): Promise<void> {
	const positional = parseArgs({
		args: Bun.argv,
		options: {
			domain: {type: 'string'},
			name: {type: 'string'},
			json: {type: 'boolean'},
		},
		strict: false,
		allowPositionals: true,
	});

	const subcommand = positional.positionals[2];
	if (!subcommand || !isSubcommand(subcommand)) {
		console.error(`[master-key] unknown subcommand: ${subcommand ?? '(none)'}`);
		printUsage();
		process.exit(1);
	}

	const domain =
		typeof positional.values.domain === 'string'
			? positional.values.domain
			: 'com.acme.bun-security-scanner';
	const service = secretsServiceForDomain(domain);
	const name =
		typeof positional.values.name === 'string' ? positional.values.name : 'vault-master-key';
	const json = positional.values.json === true;

	if (subcommand === 'init') {
		const existing = await getMasterKey({service, name});
		if (existing) {
			if (json) {
				console.log(
					JSON.stringify({domain, name, created: false, reason: 'already exists'}, null, 2),
				);
				process.exit(0);
			}
			console.error(
				colorize(TERMINAL.scannerWarn, `[master-key] ${service}/${name} already exists`),
			);
			process.exit(0);
		}

		const value = generateMasterKey();
		await setMasterKey({service, name, value});
		if (json) {
			console.log(JSON.stringify({domain, name, created: true}, null, 2));
			process.exit(0);
		}
		console.error(colorize(TERMINAL.scannerOk, `[master-key] stored ${service}/${name}`));
		process.exit(0);
	}

	if (subcommand === 'delete') {
		await deleteMasterKey({service, name});
		if (json) {
			console.log(JSON.stringify({domain, name, deleted: true}, null, 2));
			process.exit(0);
		}
		console.error(colorize(TERMINAL.scannerOk, `[master-key] deleted ${service}/${name}`));
		process.exit(0);
	}

	// rotate is reserved for future implementation
	console.error(colorize(TERMINAL.scannerFatal, `[master-key] rotate is not implemented yet`));
	process.exit(1);
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
