#!/usr/bin/env bun
import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import {
	isBuildProfile,
	profileDescription,
	profileFeatures,
	PROFILE_NAMES,
	PROFILES,
	type BuildProfile,
} from '../build/profiles.ts';
import {ALL_FEATURES, FEATURES, type FeatureName} from '../features/index.ts';
import {isMainModule} from '../utils/runtime.ts';

function envOverrideHint(name: FeatureName): string | undefined {
	const value = process.env[`FEATURE_${name}`];
	if (value === undefined) return undefined;
	return `FEATURE_${name}=${value}`;
}

function featureRows(profile?: BuildProfile) {
	const profileSet = profile ? new Set(profileFeatures(profile)) : null;
	return ALL_FEATURES.map(name => ({
		name,
		enabled: FEATURES[name],
		env: envOverrideHint(name),
		inProfile: profileSet ? profileSet.has(name) : undefined,
	}));
}

async function main(): Promise<void> {
	const {values} = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			profile: {type: 'string'},
			json: {type: 'boolean'},
			help: {type: 'boolean', short: 'h'},
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(`Usage:
  bun run flags [--json]
  bun run flags --profile agent|server|dev [--json]

List compile-time feature gates and deployment profile mappings.
Runtime overrides: FEATURE_<NAME>=true|false (e.g. FEATURE_SCAN_EXTERNAL=false).

Profiles: ${PROFILE_NAMES.join(', ')}
Features: ${ALL_FEATURES.join(', ')}`);
		process.exit(0);
	}

	const profileArg = values.profile;
	if (profileArg && !isBuildProfile(profileArg)) {
		console.error(
			colorize(
				TERMINAL.scannerFatal,
				`[flags] unknown profile: ${profileArg} (expected ${PROFILE_NAMES.join(', ')})`,
			),
		);
		process.exit(1);
	}
	const profile = profileArg && isBuildProfile(profileArg) ? profileArg : undefined;

	if (values.json) {
		const payload = profile
			? {
					profile,
					description: profileDescription(profile),
					features: profileFeatures(profile),
					flags: featureRows(profile),
				}
			: {
					profiles: PROFILE_NAMES.map(name => ({
						name,
						description: profileDescription(name),
						features: [...PROFILES[name]],
					})),
					flags: featureRows(),
				};
		console.log(JSON.stringify(payload, null, 2));
		process.exit(0);
	}

	if (profile) {
		console.log(
			colorize(TERMINAL.scannerInfo, `profile: ${profile} — ${profileDescription(profile)}`),
		);
		console.log(colorize(TERMINAL.scannerDim, `features: ${profileFeatures(profile).join(', ')}`));
		console.log('');
	}

	console.log(colorize(TERMINAL.scannerInfo, 'compile-time feature flags'));
	for (const row of featureRows(profile)) {
		const state = row.enabled
			? colorize(TERMINAL.scannerOk, 'enabled')
			: colorize(TERMINAL.scannerWarn, 'disabled');
		const env = row.env ? colorize(TERMINAL.scannerDim, ` (${row.env})`) : '';
		const inProfile =
			row.inProfile === undefined
				? ''
				: row.inProfile
					? colorize(TERMINAL.scannerDim, ' [profile]')
					: colorize(TERMINAL.scannerDim, ' [not in profile]');
		console.log(`  ${row.name}: ${state}${env}${inProfile}`);
	}

	if (!profile) {
		console.log('');
		console.log(colorize(TERMINAL.scannerInfo, 'deployment profiles'));
		for (const name of PROFILE_NAMES) {
			console.log(colorize(TERMINAL.scannerDim, `  ${name}: ${profileDescription(name)}`));
			console.log(colorize(TERMINAL.scannerDim, `    ${profileFeatures(name).join(', ')}`));
		}
	}
}

const __flagsCliMain =
	isMainModule() ||
	(process.argv[1]?.includes('flags.ts') ?? false) ||
	(Bun.argv[1]?.includes('flags.ts') ?? false);

if (__flagsCliMain) {
	await main();
}
