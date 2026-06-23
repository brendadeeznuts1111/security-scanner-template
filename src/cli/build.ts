import {parseArgs} from 'util';
import path from 'path';
import {colorize, TERMINAL} from '../color/index.ts';
import {
	isBuildProfile,
	profileDescription,
	profileFeatures,
	PROFILE_NAMES,
} from '../build/profiles.ts';
import {
	ALL_FEATURES,
	buildFeatureArgs,
	parseFeatureList,
	type FeatureName,
} from '../features/index.ts';
import {runCliIfMain} from '../utils/cli.ts';
import {spawnInheritAndExit} from '../utils/process.ts';

const DEFAULT_ENTRY = path.join(import.meta.dir, '..', 'index.ts');
const DEFAULT_OUTDIR = 'dist';

function parseDisabledFeatures(values: {
	'feature'?: string;
	'no-feature'?: string;
}): Set<FeatureName> {
	const enabled = new Set<FeatureName>(parseFeatureList(values.feature));

	if (values['no-feature']) {
		for (const name of parseFeatureList(values['no-feature'])) {
			enabled.delete(name);
		}
	}

	return enabled;
}

async function runBuild(): Promise<void> {
	const {values} = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			'feature': {type: 'string'},
			'no-feature': {type: 'string'},
			'profile': {type: 'string'},
			'outdir': {type: 'string'},
			'entry': {type: 'string'},
			'help': {type: 'boolean', short: 'h'},
			'production': {type: 'boolean'},
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(`Usage:
  bun run build -- [--profile agent|server|dev] [--feature <list>] [--no-feature <list>] [--outdir dist] [--entry src/index.ts]

Produce a deployment-specific bundle with compile-time feature gates.
Disabled features are eliminated via \`bun build --feature\`.

Profiles: ${PROFILE_NAMES.join(', ')}
Features: ${ALL_FEATURES.join(', ')}

Examples:
  bun run build -- --profile agent --outdir dist/agent
  bun run build -- --profile server --outdir dist/server
  bun run build -- --no-feature AUDIT_JSONL,REPORT_HTML --outdir dist
  bun run build -- --feature AUDIT_SQLITE,INTEL_DNS,REPORT_MARKDOWN --production`);
		process.exit(0);
	}

	let enabled: Set<FeatureName>;
	if (values.profile) {
		if (!isBuildProfile(values.profile)) {
			console.error(
				colorize(
					TERMINAL.scannerFatal,
					`[build] unknown profile: ${values.profile} (expected ${PROFILE_NAMES.join(', ')})`,
				),
			);
			process.exit(1);
		}
		enabled = new Set(profileFeatures(values.profile));
		console.error(
			colorize(
				TERMINAL.scannerInfo,
				`[build] profile=${values.profile} — ${profileDescription(values.profile)}`,
			),
		);
	} else {
		enabled = parseDisabledFeatures(values);
	}

	const outdir =
		values.outdir ?? (values.profile ? path.join(DEFAULT_OUTDIR, values.profile) : DEFAULT_OUTDIR);
	const entry = values.entry ?? DEFAULT_ENTRY;
	const featureArgs = buildFeatureArgs(enabled);

	const buildArgs = [
		'build',
		'--target=bun',
		`--outdir=${outdir}`,
		...featureArgs,
		...(values.production ? ['--production'] : []),
		entry,
	];

	console.error(colorize(TERMINAL.scannerInfo, `[build] bun ${buildArgs.join(' ')}`));

	await spawnInheritAndExit(['bun', ...buildArgs]);
}

await runCliIfMain(runBuild);
