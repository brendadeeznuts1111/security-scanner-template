import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import {
	runSupplyChainNetworkLoop,
	type SupplyChainNetworkLoopOptions,
} from './supply-chain-network-loop.ts';
import {runCliIfMain} from '../utils/cli.ts';

function buildNetworkOptions(
	values: Record<string, unknown>,
	positionals: string[],
): SupplyChainNetworkLoopOptions | null {
	const rawPath = (values.path as string | undefined) ?? positionals[1];
	if (!rawPath) {
		return null;
	}
	return {
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
			values['fail-on-drift'] === true || values['fail-on-endpoint-change'] === true,
		noColor: values['no-color'] === true,
	};
}

async function main(): Promise<void> {
	const {values, positionals} = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			path: {type: 'string'},
			root: {type: 'string'},
			domain: {type: 'string'},
			'health-url': {type: 'string'},
			'health-url-secret': {type: 'string'},
			baseline: {type: 'string'},
			'update-baseline': {type: 'boolean'},
			watch: {type: 'boolean'},
			'debounce-ms': {type: 'string'},
			json: {type: 'boolean'},
			'herdr-tab': {type: 'boolean'},
			'fail-on-health': {type: 'boolean'},
			'fail-on-drift': {type: 'boolean'},
			'fail-on-endpoint-change': {type: 'boolean'},
			'no-color': {type: 'boolean'},
			help: {type: 'boolean', short: 'h'},
		},
		allowPositionals: true,
	});

	if (values.help || positionals[0] === 'help') {
		console.log(`Usage:
  bun run supply-chain network --path <bundle-dir> [options]
  bun run supply-chain network --path dist --watch --baseline .security/network-baseline.json5

Options:
  --path                      Bundle output directory
  --root                      Project root override
  --domain                    Domain for colors and baseline path
  --health-url                Literal health probe URL
  --health-url-secret         Bun.secrets spec (service/name, e.g. sports-terminal/health/prod)
  --baseline                  Baseline JSON5 path (default: .security/<domain>/network-baseline.json5)
  --update-baseline           Persist current audit as baseline
  --watch                     Re-audit on bundle/policy/lockfile changes
  --debounce-ms               Watch debounce (default 500)
  --json                      Machine-readable tick output
  --herdr-tab                 herdr-doctor tab table layout
  --fail-on-health            Exit 1 when health is degraded/unhealthy
  --fail-on-drift             Exit 1 when endpoints differ from baseline
  --fail-on-endpoint-change   Alias for --fail-on-drift`);
		process.exit(0);
	}

	const options = buildNetworkOptions(values, positionals);
	if (!options) {
		console.error(colorize(TERMINAL.scannerFatal, '[supply-chain] network requires --path'));
		process.exit(1);
	}

	try {
		process.exit(await runSupplyChainNetworkLoop(options));
	} catch (error) {
		console.error(
			colorize(
				TERMINAL.scannerFatal,
				`[supply-chain] ${error instanceof Error ? error.message : String(error)}`,
			),
		);
		process.exit(1);
	}
}

await runCliIfMain(main, import.meta.path);