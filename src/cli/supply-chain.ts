import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import {domainRegistry} from '../config/registry.ts';
import {
	isSupplyChainScanProfile,
	SUPPLY_CHAIN_SCAN_PROFILES,
} from './supply-chain-profiles.ts';
import {runSupplyChainDeepScan} from './supply-chain-scan.ts';
import {runCliIfMain} from '../utils/cli.ts';

async function runSupplyChainScan(values: Record<string, unknown>, positionals: string[]): Promise<number> {
	const rawPath = (values.path as string | undefined) ?? positionals[1];
	if (!rawPath) {
		console.error(colorize(TERMINAL.scannerFatal, '[supply-chain] --path is required'));
		return 1;
	}

	const profileName = values.profile as string | undefined;
	if (profileName && !isSupplyChainScanProfile(profileName)) {
		const known = Object.keys(SUPPLY_CHAIN_SCAN_PROFILES).join(', ');
		console.error(
			colorize(TERMINAL.scannerFatal, `[supply-chain] unknown profile "${profileName}" (known: ${known})`),
		);
		return 1;
	}

	const format =
		values.format === 'json' || values.format === 'markdown' || values.format === 'html'
			? (values.format as 'json' | 'markdown' | 'html')
			: undefined;

	const explicitRules = (values.rules as string | undefined)
		?.split(',')
		.map(rule => rule.trim())
		.filter(Boolean);

	try {
		return await runSupplyChainDeepScan({
			path: rawPath,
			profile: profileName,
			domain: values.domain as string | undefined,
			rules: explicitRules,
			format: format === 'html' ? 'json' : format,
			output: values.output as string | undefined,
			projectRoot: values.root as string | undefined,
			policyPath: values.policy as string | undefined,
			verifyIntegrity: values['verify-integrity'] === true,
			threatFeed: values['threat-feed'] === true,
			feedUrl: values['feed-url'] as string | undefined,
			transitive: values.transitive === true,
			registry: domainRegistry,
			emitFormattedStdout: format === 'markdown' || format === 'json',
		});
	} catch (error) {
		console.error(
			colorize(
				TERMINAL.scannerFatal,
				`[supply-chain] ${error instanceof Error ? error.message : String(error)}`,
			),
		);
		return 1;
	}
}

async function main(): Promise<void> {
	const {values, positionals} = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			profile: {type: 'string'},
			path: {type: 'string'},
			root: {type: 'string'},
			domain: {type: 'string'},
			policy: {type: 'string'},
			rules: {type: 'string'},
			format: {type: 'string'},
			output: {type: 'string'},
			'verify-integrity': {type: 'boolean'},
			'threat-feed': {type: 'boolean'},
			'feed-url': {type: 'string'},
			transitive: {type: 'boolean'},
			json: {type: 'boolean'},
			markdown: {type: 'boolean'},
			help: {type: 'boolean', short: 'h'},
		},
		allowPositionals: true,
	});

	if (values.help || positionals[0] === 'help') {
		const profiles = Object.entries(SUPPLY_CHAIN_SCAN_PROFILES)
			.map(([name, spec]) => {
				const layers = [
					spec.includeBundle && 'bundle',
					spec.includePackages && 'packages',
					spec.includeConstraints && 'constraints',
				]
					.filter(Boolean)
					.join(', ');
				return `    ${name} — ${spec.description} [${layers}]`;
			})
			.join('\n');
		console.log(`Usage:
  bun run supply-chain scan --profile <name> --path <dir|file> [--format json|markdown] [--output path]
  bun run supply-chain scan --profile supply-chain-network --path projects/active/sports-terminal-os/dist --format markdown

Profiles:
${profiles}

Options:
  --profile              Rule subset and scan layers
  --path                 Bundle directory or file (auto-resolves monorepo paths)
  --root                 Project root override (default: nearest package.json parent)
  --policy               Path to security.policy.toml override
  --domain               Domain for threat-feed and snapshot integration
  --format               Report format (markdown/json to stdout)
  --threat-feed          Include remote threat-feed matching (requires --domain or local rules)
  --feed-url             Threat feed URL override
  --transitive           Scan all of node_modules for constraint rules
  --verify-integrity     Verify bundle integrity manifest hashes
  --output               Write report to file`);
		process.exit(0);
	}

	const command = positionals[0];
	switch (command) {
		case 'scan':
			process.exit(await runSupplyChainScan(values, positionals));
			return;
		case 'profiles': {
			console.log(JSON.stringify(SUPPLY_CHAIN_SCAN_PROFILES, null, 2));
			process.exit(0);
			return;
		}
		default:
			console.error(
				colorize(TERMINAL.scannerFatal, `[supply-chain] unknown command: ${command ?? '(none)'}`),
			);
			console.error(colorize(TERMINAL.scannerDim, 'Try: bun run supply-chain scan --help'));
			process.exit(1);
	}
}

await runCliIfMain(main, import.meta.path);