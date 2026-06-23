import {parseArgs} from 'util';
import {
	runVaultDelete,
	runVaultDoctor,
	runVaultGet,
	runVaultSet,
	runVaultStatus,
} from './vault-commands.ts';

const SUBCOMMANDS = ['status', 'set', 'get', 'delete', 'doctor'] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

function isSubcommand(value: string): value is Subcommand {
	return SUBCOMMANDS.includes(value as Subcommand);
}

function printUsage(): void {
	console.error(`Usage: bun run vault <subcommand> [options]

Subcommands:
  status   List secrets for a domain
  set      Store a secret
  get      Read a secret
  delete   Delete a secret
  doctor   Verify all required secrets across all domains

Options:
  --domain <domain>   Target domain (default: com.acme.bun-security-scanner)
  --name <name>       Secret name (required for set/get/delete)
  --value <value>     Secret value (optional for set; prompts otherwise)
  --json              Emit JSON instead of human-readable tables
`);
}

async function main(): Promise<void> {
	const positional = parseArgs({
		args: Bun.argv,
		options: {
			domain: {type: 'string'},
			name: {type: 'string'},
			value: {type: 'string'},
			json: {type: 'boolean'},
		},
		strict: false,
		allowPositionals: true,
	});

	// Positionals are [bun, script, subcommand, ...extras].
	const subcommand = positional.positionals[2];

	if (!subcommand || !isSubcommand(subcommand)) {
		console.error(`[vault] unknown subcommand: ${subcommand ?? '(none)'}`);
		printUsage();
		process.exit(1);
	}

	function toString(value: string | boolean | undefined): string | undefined {
		return typeof value === 'string' ? value : undefined;
	}

	const options = {
		domain: toString(positional.values.domain),
		name: toString(positional.values.name),
		value: toString(positional.values.value),
		json: positional.values.json === true,
	};

	switch (subcommand) {
		case 'status':
			await runVaultStatus(options);
			break;
		case 'set':
			await runVaultSet(options);
			break;
		case 'get':
			await runVaultGet(options);
			break;
		case 'delete':
			await runVaultDelete(options);
			break;
		case 'doctor':
			await runVaultDoctor(options);
			break;
	}
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
