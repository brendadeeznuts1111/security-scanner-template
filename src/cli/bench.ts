#!/usr/bin/env bun
import path from 'path';
import {parseArgs} from 'util';
import {colorize, TERMINAL} from '../color/index.ts';
import {collectBenchmarkRunMetadata, isBenchmarkRunnerMode} from '../utils/bench-metadata.ts';
import {isMainModule} from '../utils/runtime.ts';
import {spawnInheritAndExit} from '../utils/process.ts';

const BENCH_DIR = path.join(import.meta.dir, '../../bench');
const SUITES = [
	'doctor',
	'field-matrix',
	'domain-load',
	'artifact-spec',
	'ground-truth',
	'all',
] as const;
type BenchSuite = (typeof SUITES)[number];

const HELP = `Usage:
  bun run bench [--suite doctor|field-matrix|domain-load|artifact-spec|ground-truth|all] [--json] [--root <path>]
  bun sp bench [--suite <name>] [--json] [--root <path>]

Microbenchmarks use mitata (see bench/ and https://bun.sh/docs/project/benchmarking).

Profiling hot paths:
  bun --cpu-prof-md --heap-prof-md bench/doctor/bench.mjs
  MIMALLOC_SHOW_STATS=1 bun bench/domain-load/bench.mjs

CI / JSON output:
  BENCHMARK_RUNNER=1 bun bench/doctor/bench.mjs`;

function resolveSuite(value: string | undefined): BenchSuite {
	if (value && SUITES.includes(value as BenchSuite)) {
		return value as BenchSuite;
	}
	return 'all';
}

async function runBenchCli(options: {
	suite?: BenchSuite;
	json?: boolean;
	root?: string;
}): Promise<void> {
	const suite = options.suite ?? 'all';
	const env: Record<string, string> = {};

	if (options.json || isBenchmarkRunnerMode()) {
		env.BENCHMARK_RUNNER = '1';
	}
	if (options.root) {
		env.BENCH_ROOT = options.root;
	}

	const script =
		suite === 'all'
			? path.join(BENCH_DIR, 'package.json')
			: path.join(BENCH_DIR, `${suite}/bench.mjs`);

	const args = suite === 'all' ? ['bun', 'run', '--cwd', BENCH_DIR, 'all'] : ['bun', script];

	if (!options.json && !isBenchmarkRunnerMode(env)) {
		const metadata = await collectBenchmarkRunMetadata({
			heap: true,
			packageJsonPath: options.root
				? `${options.root}/package.json`
				: `${process.cwd()}/package.json`,
		});
		console.error(
			colorize(
				TERMINAL.muted,
				`bench: bun ${metadata.bun.version} (${metadata.bun.revision.slice(0, 8)}) · suite=${suite}`,
			),
		);
		if (metadata.heap) {
			console.error(
				colorize(
					TERMINAL.muted,
					`heap: ${metadata.heap.objectCount} objects · ${metadata.heap.heapSize} bytes`,
				),
			);
		}
	}

	await spawnInheritAndExit(args, {cwd: process.cwd(), env: {...process.env, ...env}});
}

async function main(): Promise<void> {
	const parsed = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			suite: {type: 'string'},
			json: {type: 'boolean'},
			root: {type: 'string'},
			help: {type: 'boolean', short: 'h'},
		},
		allowPositionals: true,
		strict: false,
	});

	if (parsed.values.help) {
		console.log(HELP);
		process.exit(0);
	}

	await runBenchCli({
		suite: resolveSuite(typeof parsed.values.suite === 'string' ? parsed.values.suite : undefined),
		json: parsed.values.json === true,
		root: typeof parsed.values.root === 'string' ? parsed.values.root : undefined,
	});
}

const __benchCliMain =
	isMainModule() ||
	(process.argv[1]?.includes('bench.ts') ?? false) ||
	(Bun.argv[1]?.includes('bench.ts') ?? false);

if (__benchCliMain) {
	await main();
}

export {runBenchCli, type BenchSuite};
