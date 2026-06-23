import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import {domainRegistry} from '../config/registry.ts';
import {
	isSupplyChainScanProfile,
	SUPPLY_CHAIN_SCAN_PROFILES,
} from './supply-chain-profiles.ts';
import {runSupplyChainDeepScan, type SupplyChainDeepScanOptions} from './supply-chain-scan.ts';
import {runSupplyChainDeepScanLoop} from './supply-chain-loop.ts';
import {watchSupplyChainDeepScan} from './supply-chain-watch.ts';
import {runSupplyChainNetworkLoop} from './supply-chain-network-loop.ts';
import {runCliIfMain} from '../utils/cli.ts';

function buildScanOptions(
	values: Record<string, unknown>,
	positionals: string[],
): SupplyChainDeepScanOptions | null {
	const rawPath = (values.path as string | undefined) ?? positionals[1];
	if (!rawPath) {
		return null;
	}

	const format =
		values.format === 'json' || values.format === 'markdown' || values.format === 'html'
			? (values.format as 'json' | 'markdown' | 'html')
			: values.json === true
				? 'json'
				: values.markdown === true
					? 'markdown'
					: undefined;

	const explicitRules = (values.rules as string | undefined)
		?.split(',')
		.map(rule => rule.trim())
		.filter(Boolean);

	return {
		path: rawPath,
		profile: values.profile as string | undefined,
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
	};
}

async function runSupplyChainScan(values: Record<string, unknown>, positionals: string[]): Promise<number> {
	const profileName = values.profile as string | undefined;
	if (profileName && !isSupplyChainScanProfile(profileName)) {
		const known = Object.keys(SUPPLY_CHAIN_SCAN_PROFILES).join(', ');
		console.error(
			colorize(TERMINAL.scannerFatal, `[supply-chain] unknown profile "${profileName}" (known: ${known})`),
		);
		return 1;
	}

	const options = buildScanOptions(values, positionals);
	if (!options) {
		console.error(colorize(TERMINAL.scannerFatal, '[supply-chain] --path is required'));
		return 1;
	}

	const useLoop =
		values.fix === true ||
		values['operator-log'] === true ||
		typeof values['max-rounds'] === 'number';

	try {
		if (useLoop) {
			const maxRoundsRaw = values['max-rounds'] as string | undefined;
			const maxRounds = maxRoundsRaw ? Number.parseInt(maxRoundsRaw, 10) : undefined;
			return await runSupplyChainDeepScanLoop({
				...options,
				fix: values.fix === true,
				operatorLog: values['operator-log'] === true,
				maxRounds: Number.isFinite(maxRounds) ? maxRounds : undefined,
			});
		}
		return await runSupplyChainDeepScan(options);
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

async function runSupplyChainWatch(values: Record<string, unknown>, positionals: string[]): Promise<number> {
	const profileName = values.profile as string | undefined;
	if (profileName && !isSupplyChainScanProfile(profileName)) {
		const known = Object.keys(SUPPLY_CHAIN_SCAN_PROFILES).join(', ');
		console.error(
			colorize(TERMINAL.scannerFatal, `[supply-chain] unknown profile "${profileName}" (known: ${known})`),
		);
		return 1;
	}

	const options = buildScanOptions(values, positionals);
	if (!options) {
		console.error(colorize(TERMINAL.scannerFatal, '[supply-chain] --path is required'));
		return 1;
	}

	try {
		const debounceRaw = values['debounce-ms'] as string | undefined;
		const debounceMs = debounceRaw ? Number.parseInt(debounceRaw, 10) : undefined;
		await watchSupplyChainDeepScan({
			...options,
			fix: values.fix === true,
			operatorLog: values['operator-log'] === true,
			debounceMs: Number.isFinite(debounceMs) ? debounceMs : undefined,
		});
		return 0;
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
			fix: {type: 'boolean'},
			'operator-log': {type: 'boolean'},
			'max-rounds': {type: 'string'},
			'debounce-ms': {type: 'string'},
			'health-url': {type: 'string'},
			'health-url-secret': {type: 'string'},
			baseline: {type: 'string'},
			'update-baseline': {type: 'boolean'},
			watch: {type: 'boolean'},
			'herdr-tab': {type: 'boolean'},
			'fail-on-health': {type: 'boolean'},
			'fail-on-drift': {type: 'boolean'},
			'fail-on-endpoint-change': {type: 'boolean'},
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
  bun run supply-chain watch --profile <name> --path <dir|file> [--fix] [--operator-log]
  bun run supply-chain network --path <bundle-dir> [--watch] [--baseline path] [--health-url-secret svc/name]
  bun run supply-chain scan --profile supply-chain-network --path dist --format markdown --fix

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
  --fix                  Apply auto-fixable remediations and re-scan (up to 3 rounds)
  --operator-log         Append findings to .security/operator.jsonl
  --max-rounds           Cap scan/fix loop rounds (default 3 with --fix, else 1)
  --debounce-ms          Watch debounce interval (default 500)
  --output               Write report to file`);
		process.exit(0);
	}

	const command = positionals[0];
	switch (command) {
		case 'scan':
			process.exit(await runSupplyChainScan(values, positionals));
			return;
		case 'watch':
			process.exit(await runSupplyChainWatch(values, positionals));
			return;
		case 'network': {
			const rawPath = (values.path as string | undefined) ?? positionals[1];
			if (!rawPath) {
				console.error(colorize(TERMINAL.scannerFatal, '[supply-chain] network requires --path'));
				process.exit(1);
			}
			try {
				process.exit(
					await runSupplyChainNetworkLoop({
						path: rawPath,
						domain: values.domain as string | undefined,
						projectRoot: values.root as string | undefined,
						healthUrl: values['health-url'] as string | undefined,
						healthUrlSecret: values['health-url-secret'] as string | undefined,
						baseline: values.baseline as string | undefined,
						updateBaseline: values['update-baseline'] === true,
						watch: values.watch === true,
						debounceMs: values['debounce-ms']
							? Number.parseInt(String(values['debounce-ms']), 10)
							: undefined,
						json: values.json === true,
						herdrTab: values['herdr-tab'] === true,
						failOnHealth: values['fail-on-health'] === true,
						failOnDrift:
							values['fail-on-drift'] === true ||
							values['fail-on-endpoint-change'] === true,
					}),
				);
			} catch (error) {
				console.error(
					colorize(
						TERMINAL.scannerFatal,
						`[supply-chain] ${error instanceof Error ? error.message : String(error)}`,
					),
				);
				process.exit(1);
			}
			return;
		}
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