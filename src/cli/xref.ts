import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import {
	CROSS_REF_CATALOG,
	getCrossRef,
	getCrossRefsByCli,
	getCrossRefsByConfigField,
	getCrossRefsByFeature,
	getCrossRefsByLayer,
	getCrossRefsByModule,
	getFeatureCrossRefMap,
	getRelatedCrossRefs,
	listCrossRefs,
	validateCrossRefApis,
	type IntegrationLayer,
} from '../xref/index.ts';
import {getArtifactSpecEntry} from '../utils/bun-create-catalog.ts';
import {
	auditDoctorLoops,
	executeLoopCliAsync,
	formatDoctorLoopTable,
	formatLoopCliJson,
	type LoopCliResult,
	type LoopKind,
} from '../xref/loop-cli.ts';
import {ALL_FEATURES, type FeatureName} from '../features/index.ts';
import {
	auditGroundTruthCatalog,
	formatGroundTruthTable,
	formatRepoRefUrl,
	getGroundTruthForXref,
	listGroundTruthEntries,
	planGroundTruthLoop,
} from '../utils/ground-truth-catalog.ts';
import {evaluateGroundTruthGoal} from '../utils/ground-truth-goal.ts';
import {
	defaultGroundTruthSnapshotPath,
	evaluateGroundTruthSnapshotGate,
} from '../utils/ground-truth-snapshot.ts';
import {nanoseconds} from '../utils/nanoseconds.ts';
import {runCliIfMain} from '../utils/cli.ts';

const LAYERS: IntegrationLayer[] = [
	'runtime',
	'config',
	'storage',
	'intelligence',
	'scanning',
	'reporting',
	'cli',
];

function printLoopResult(
	result: LoopCliResult,
	options: {
		id: string;
		dryRun: boolean;
		quiet: boolean;
		bidirectional: boolean;
		count: boolean;
		json: boolean;
		stepsOnly: boolean;
	},
): number {
	if (options.count && !options.json) {
		console.log(String(result.count));
		return result.validation && !result.validation.ok ? 1 : 0;
	}

	if (options.json) {
		console.log(formatLoopCliJson(result));
		return result.validation && !result.validation.ok ? 1 : 0;
	}

	if (options.stepsOnly) {
		for (const step of result.steps) {
			console.log(step.id);
		}
		return result.validation && !result.validation.ok ? 1 : 0;
	}

	if (!options.quiet) {
		const mode = options.dryRun ? 'dry-run' : result.kind;
		const depthNote = options.bidirectional ? ' (bidirectional)' : '';
		const benchNote = result.benchmarkNs !== undefined ? ` · ${result.benchmarkNs}ns` : '';
		console.log(
			colorize(
				TERMINAL.muted,
				`[xref] loop ${mode} from ${options.id} — ${result.count} step(s)${depthNote}${benchNote}`,
			),
		);
	}

	for (const step of result.steps) {
		const via = step.via ? ` via ${step.via}` : '';
		const prefix = `${'  '.repeat(step.depth)}${step.id} (depth ${step.depth}${via})`;
		if (options.dryRun) {
			console.log(colorize(TERMINAL.scannerInfo, prefix));
			continue;
		}

		if (result.kind === 'domain-init') {
			console.log(colorize(TERMINAL.scannerInfo, prefix));
			const plan = result.domainPlans?.find(entry => entry.domain === step.id);
			if (plan && step.depth === 0) {
				console.log(`    ${plan.packageName} — ${plan.configPath}`);
			}
			continue;
		}

		if (result.kind === 'ground-truth') {
			console.log(colorize(TERMINAL.scannerInfo, prefix));
			const gtStep = planGroundTruthLoop(result.startId, {includeStart: true}).find(
				gt => gt.id === step.id,
			);
			if (gtStep?.url) {
				console.log(`    ${gtStep.url}`);
			} else if (gtStep?.label) {
				console.log(`    ${gtStep.label}`);
			}
			continue;
		}

		const entry = result.kind === 'xref' ? getCrossRef(step.id) : getArtifactSpecEntry(step.id);
		if (!entry) {
			console.log(colorize(TERMINAL.scannerWarn, prefix));
			continue;
		}

		console.log(colorize(TERMINAL.scannerInfo, prefix));
		if (result.kind === 'xref' && 'name' in entry) {
			console.log(`    ${entry.name} — ${entry.layer}`);
		} else if ('path' in entry) {
			console.log(`    ${entry.path} — ${entry.kind}`);
		}
	}

	if (!options.dryRun && !options.quiet && result.neighbours) {
		console.log('');
		console.log(
			colorize(TERMINAL.muted, `[xref] neighbours: ${result.neighbours.join(', ') || 'none'}`),
		);
	}

	if (result.validation) {
		if (!options.quiet) {
			console.log('');
		}
		const label = result.validation.ok
			? colorize(TERMINAL.scannerOk, '[xref] loop validation ok')
			: colorize(TERMINAL.scannerFatal, '[xref] loop validation failed');
		if (!options.quiet || !result.validation.ok) {
			console.log(label);
		}
		for (const finding of result.validation.findings) {
			const color = finding.severity === 'error' ? TERMINAL.scannerFatal : TERMINAL.scannerWarn;
			console.error(colorize(color, `  ${finding.id}: ${finding.message}`));
		}
	}

	return result.validation && !result.validation.ok ? 1 : 0;
}

function formatEntry(entry: ReturnType<typeof getCrossRef>): string {
	if (!entry) return '';

	const lines = [
		`${colorize(TERMINAL.scannerInfo, entry.id)} — ${entry.name}`,
		`  layer: ${entry.layer}`,
	];

	if (entry.bunApi) lines.push(`  bunApi: ${entry.bunApi}`);
	if (entry.feature) lines.push(`  feature: ${entry.feature}`);
	if (entry.modules.length) lines.push(`  modules: ${entry.modules.join(', ')}`);
	if (entry.exports?.length) lines.push(`  exports: ${entry.exports.join(', ')}`);
	if (entry.configFields?.length) lines.push(`  config: ${entry.configFields.join(', ')}`);
	if (entry.cliCommands?.length) lines.push(`  cli: ${entry.cliCommands.join(', ')}`);
	if (entry.related?.length) lines.push(`  related: ${entry.related.join(', ')}`);
	if (entry.docsUrl) lines.push(`  docs: ${entry.docsUrl}`);

	const groundTruth = getGroundTruthForXref(entry.id);
	if (groundTruth) {
		lines.push('  groundTruth:');
		for (const ref of groundTruth.refs) {
			lines.push(`    ${ref.label}: ${formatRepoRefUrl(ref)}`);
		}
	}

	lines.push(`  ${entry.description}`);
	return lines.join('\n');
}

async function main(): Promise<void> {
	const {values, positionals} = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			'id': {type: 'string'},
			'layer': {type: 'string'},
			'feature': {type: 'string'},
			'module': {type: 'string'},
			'config': {type: 'string'},
			'cli': {type: 'string'},
			'depth': {type: 'string'},
			'bidirectional': {type: 'boolean'},
			'validate': {type: 'boolean'},
			'dry-run': {type: 'boolean'},
			'dryrun': {type: 'boolean'},
			'steps-only': {type: 'boolean'},
			'no-include-start': {type: 'boolean'},
			'benchmark': {type: 'boolean'},
			'quiet': {type: 'boolean', short: 'q'},
			'count': {type: 'boolean'},
			'all': {type: 'boolean'},
			'kind': {type: 'string'},
			'root': {type: 'string'},
			'json': {type: 'boolean'},
			'goal': {type: 'boolean'},
			'snapshot': {type: 'boolean'},
			'update-snapshots': {type: 'boolean', short: 'u'},
			'fail-on-drift': {type: 'boolean'},
			'help': {type: 'boolean', short: 'h'},
		},
		allowPositionals: true,
	});

	if (values.help) {
		console.log(`Usage:
  bun run xref list [--layer <layer>] [--feature <name>] [--module <path>]
  bun run xref get --id <cross-ref-id>
  bun run xref related --id <cross-ref-id>
  bun run xref loop --id <id> [--kind xref|artifact|domain-init|ground-truth] [--depth <n>] [--bidirectional]
      [--dry-run] [--steps-only] [--no-include-start] [--validate] [--benchmark]
      [--count] [--quiet] [--json] [--root <path>]
  bun run xref loop --all [--dry-run] [--validate] [--benchmark] [--json] [--root <path>]
      (DD-Loop: audits canonical doctor seeds)
  bun run xref features [--json]
  bun run xref config --config <field>
  bun run xref cli --cli <command>
  bun run xref validate [--json]
  bun run xref ground-truth [--id <xref-id>] [--json] [--goal] [--snapshot] [--update-snapshots|-u] [--fail-on-drift] [--benchmark]

Cross-reference Bun APIs, feature flags, config fields, and CLI commands.

Layers: ${LAYERS.join(', ')}
Features: ${ALL_FEATURES.join(', ')}`);
		process.exit(0);
	}

	const command = positionals[0] ?? 'list';

	if (command === 'validate' || (values.validate === true && command !== 'loop')) {
		const result = validateCrossRefApis();
		if (values.json) {
			console.log(JSON.stringify(result, null, 2));
		} else {
			console.log(
				result.ok
					? colorize(TERMINAL.scannerOk, '[xref] all required APIs available')
					: colorize(
							TERMINAL.scannerFatal,
							`[xref] missing required APIs: ${result.requiredMissing.join(', ')}`,
						),
			);
			if (result.optionalMissing.length) {
				console.error(
					colorize(
						TERMINAL.scannerWarn,
						`[xref] optional APIs unavailable: ${result.optionalMissing.join(', ')}`,
					),
				);
			}
			if (result.featureDisabled.length) {
				console.error(
					colorize(
						TERMINAL.scannerInfo,
						`[xref] feature-gated entries disabled: ${result.featureDisabled.join(', ')}`,
					),
				);
			}
			if (!result.catalog.ok) {
				for (const finding of result.catalog.findings.filter(entry => entry.severity === 'error')) {
					console.error(
						colorize(
							TERMINAL.scannerFatal,
							`[xref] catalog ${finding.kind}: ${finding.id} — ${finding.message}`,
						),
					);
				}
			}
			if (result.catalog.missingModules.length) {
				console.error(
					colorize(
						TERMINAL.scannerWarn,
						`[xref] catalog missing modules: ${result.catalog.missingModules
							.map(entry => `${entry.id}→${entry.module}`)
							.join(', ')}`,
					),
				);
			}
			if (result.catalog.runtimeDrift.length) {
				console.error(
					colorize(
						TERMINAL.scannerInfo,
						`[xref] runtime-catalog drift: ${result.catalog.runtimeDrift.join(', ')}`,
					),
				);
			}
		}
		process.exit(result.ok ? 0 : 1);
	}

	if (command === 'get') {
		const id = values.id ?? positionals[1];
		if (!id) {
			console.error(colorize(TERMINAL.scannerFatal, '[xref] --id is required'));
			process.exit(1);
		}

		const entry = getCrossRef(id);
		if (!entry) {
			console.error(colorize(TERMINAL.scannerFatal, `[xref] unknown id: ${id}`));
			process.exit(1);
		}

		if (values.json) {
			console.log(JSON.stringify(entry, null, 2));
		} else {
			console.log(formatEntry(entry));
		}
		process.exit(0);
	}

	if (command === 'loop') {
		const root = typeof values.root === 'string' ? values.root : process.cwd();
		const dryRun = values['dry-run'] === true || values.dryrun === true;
		const quiet = values.quiet === true;
		const maxDepth = values.depth ? Number.parseInt(values.depth, 10) : undefined;

		if (values.all === true) {
			const audit = await auditDoctorLoops(root, {
				dryRun,
				maxDepth,
				bidirectional: values.bidirectional ?? undefined,
			});
			if (values.json) {
				console.log(JSON.stringify(audit, null, 2));
			} else if (!quiet) {
				console.log(colorize(TERMINAL.muted, '[xref] DD-Loop — doctor canonical seeds'));
				console.log(formatDoctorLoopTable(audit));
				for (const seed of audit.seeds) {
					for (const finding of seed.findings) {
						const color =
							finding.severity === 'error' ? TERMINAL.scannerFatal : TERMINAL.scannerWarn;
						console.error(colorize(color, `  ${seed.startId}: ${finding.message}`));
					}
				}
			} else {
				console.log(audit.ok ? 'ok' : 'fail');
			}
			process.exit(audit.ok ? 0 : 1);
		}

		const id = values.id ?? positionals[1];
		if (!id) {
			console.error(
				colorize(TERMINAL.scannerFatal, '[xref] --id is required (or use --all for DD-Loop)'),
			);
			process.exit(1);
		}

		const kindRaw = typeof values.kind === 'string' ? values.kind : 'xref';
		const LOOP_KINDS: LoopKind[] = ['xref', 'artifact', 'domain-init', 'ground-truth'];
		if (!LOOP_KINDS.includes(kindRaw as LoopKind)) {
			console.error(
				colorize(
					TERMINAL.scannerFatal,
					`[xref] --kind must be xref, artifact, domain-init, or ground-truth (got "${kindRaw}")`,
				),
			);
			process.exit(1);
		}

		const result = await executeLoopCliAsync({
			id,
			kind: kindRaw as LoopKind,
			maxDepth,
			bidirectional: values.bidirectional ?? false,
			includeStart: values['no-include-start'] !== true,
			dryRun,
			stepsOnly: values['steps-only'] === true,
			validate: values.validate === true,
			benchmark: values.benchmark === true,
			quiet,
			count: values.count === true,
			json: values.json === true,
			root,
		});

		const exitCode = printLoopResult(result, {
			id,
			dryRun,
			quiet,
			bidirectional: values.bidirectional === true,
			count: values.count === true,
			json: values.json === true,
			stepsOnly: values['steps-only'] === true,
		});
		process.exit(exitCode);
	}

	if (command === 'related') {
		const id = values.id ?? positionals[1];
		if (!id) {
			console.error(colorize(TERMINAL.scannerFatal, '[xref] --id is required'));
			process.exit(1);
		}

		const related = getRelatedCrossRefs(id);
		if (values.json) {
			console.log(JSON.stringify(related, null, 2));
		} else {
			for (const entry of related) {
				console.log(formatEntry(entry));
				console.log('');
			}
		}
		process.exit(0);
	}

	if (command === 'features') {
		const map = getFeatureCrossRefMap();
		if (values.json) {
			console.log(JSON.stringify(map, null, 2));
		} else {
			for (const feature of ALL_FEATURES) {
				const entries = map[feature as FeatureName];
				console.log(colorize(TERMINAL.scannerInfo, feature));
				for (const entry of entries) {
					console.log(`  ${entry.id} — ${entry.name}`);
				}
			}
		}
		process.exit(0);
	}

	if (command === 'config') {
		const field = values.config ?? positionals[1];
		if (!field) {
			console.error(colorize(TERMINAL.scannerFatal, '[xref] --config is required'));
			process.exit(1);
		}

		const entries = getCrossRefsByConfigField(field);
		if (values.json) {
			console.log(JSON.stringify(entries, null, 2));
		} else {
			for (const entry of entries) {
				console.log(formatEntry(entry));
				console.log('');
			}
		}
		process.exit(0);
	}

	if (command === 'cli') {
		const cli = values.cli ?? positionals.slice(1).join(' ');
		if (!cli) {
			console.error(colorize(TERMINAL.scannerFatal, '[xref] --cli is required'));
			process.exit(1);
		}

		const entries = getCrossRefsByCli(cli);
		if (values.json) {
			console.log(JSON.stringify(entries, null, 2));
		} else {
			for (const entry of entries) {
				console.log(formatEntry(entry));
				console.log('');
			}
		}
		process.exit(0);
	}

	if (command === 'ground-truth' || command === 'groundtruth' || command === 'repos') {
		const xrefId = values.id ?? positionals[1];
		const root = typeof values.root === 'string' ? values.root : process.cwd();
		const benchmark = values.benchmark === true;
		const startNs = benchmark ? nanoseconds() : undefined;

		if (xrefId) {
			const entry = getGroundTruthForXref(xrefId);
			if (!entry) {
				console.error(
					colorize(TERMINAL.scannerFatal, `[xref] no ground truth for xref id: ${xrefId}`),
				);
				process.exit(1);
			}
			if (values.json) {
				console.log(JSON.stringify(entry, null, 2));
			} else {
				console.log(formatGroundTruthTable([entry]));
			}
			process.exit(0);
		}

		const useSnapshot =
			values.snapshot === true ||
			values['update-snapshots'] === true ||
			values['fail-on-drift'] === true;

		if (useSnapshot) {
			const gate = await evaluateGroundTruthSnapshotGate(root, {
				updateBaseline: values['update-snapshots'] === true,
				failOnGoal: values.goal === true || values['fail-on-drift'] === true,
			});
			const payload = {
				gate,
				benchmarkNs: benchmark && startNs !== undefined ? nanoseconds() - startNs : undefined,
			};
			if (values.json) {
				console.log(JSON.stringify(payload, null, 2));
			} else {
				console.log(
					colorize(
						gate.ok ? TERMINAL.scannerOk : TERMINAL.scannerFatal,
						`[xref] ground-truth snapshot ${gate.ok ? 'ok' : 'drift'} — ${gate.goal.summary}`,
					),
				);
				console.log(`  fingerprint: ${gate.snapshot.fingerprint}`);
				console.log(`  baseline: ${gate.baselinePath ?? defaultGroundTruthSnapshotPath(root)}`);
				if (!gate.drift.ok) {
					if (gate.drift.changedXrefIds.length) {
						console.error(`  changed: ${gate.drift.changedXrefIds.join(', ')}`);
					}
					if (gate.drift.addedXrefIds.length) {
						console.error(`  added: ${gate.drift.addedXrefIds.join(', ')}`);
					}
					if (gate.drift.removedXrefIds.length) {
						console.error(`  removed: ${gate.drift.removedXrefIds.join(', ')}`);
					}
				}
				if (values.goal) {
					for (const target of gate.goal.targets) {
						const mark = target.met ? '✓' : '✗';
						console.log(
							`  ${mark} ${target.id}: ${target.label}${target.detail ? ` (${target.detail})` : ''}`,
						);
					}
				}
				if (payload.benchmarkNs !== undefined) {
					console.log(colorize(TERMINAL.muted, `  benchmark: ${payload.benchmarkNs}ns`));
				}
			}
			process.exit(gate.ok ? 0 : 1);
		}

		const audit = await auditGroundTruthCatalog(root);
		const goal = evaluateGroundTruthGoal(audit);
		const benchmarkNs = benchmark && startNs !== undefined ? nanoseconds() - startNs : undefined;

		if (values.json) {
			console.log(
				JSON.stringify({audit, goal, entries: listGroundTruthEntries(), benchmarkNs}, null, 2),
			);
		} else {
			console.log(formatGroundTruthTable());
			if (values.goal) {
				console.log('');
				console.log(colorize(TERMINAL.scannerInfo, `[xref] goal: ${goal.summary}`));
				for (const target of goal.targets) {
					const mark = target.met ? '✓' : '✗';
					console.log(
						`  ${mark} ${target.id}: ${target.label}${target.detail ? ` (${target.detail})` : ''}`,
					);
				}
			}
			if (!audit.ok) {
				for (const finding of audit.validation.findings) {
					console.error(colorize(TERMINAL.scannerFatal, `  ${finding.xrefId}: ${finding.message}`));
				}
			}
			if (benchmarkNs !== undefined) {
				console.log(colorize(TERMINAL.muted, `[xref] benchmark: ${benchmarkNs}ns`));
			}
		}
		const exitOk = audit.ok && (!values.goal || goal.ok);
		process.exit(exitOk ? 0 : 1);
	}

	// Default: list
	let entries = listCrossRefs();

	if (values.layer) {
		entries = getCrossRefsByLayer(values.layer as IntegrationLayer);
	}
	if (values.feature) {
		entries = getCrossRefsByFeature(values.feature.toUpperCase() as FeatureName);
	}
	if (values.module) {
		entries = getCrossRefsByModule(values.module);
	}
	if (values.config) {
		entries = getCrossRefsByConfigField(values.config);
	}
	if (values.cli) {
		entries = getCrossRefsByCli(values.cli);
	}

	if (values.json) {
		console.log(JSON.stringify(entries, null, 2));
	} else {
		console.log(colorize(TERMINAL.muted, `[xref] ${entries.length} entries`));
		for (const entry of entries) {
			console.log(formatEntry(entry));
			console.log('');
		}
	}
}

await runCliIfMain(main, import.meta.path);
