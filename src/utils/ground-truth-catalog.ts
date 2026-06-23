/**
 * Ground-truth references to authoritative upstream repositories.
 * Links local xref integrations to canonical Bun and Effect-TS source.
 *
 * @see https://github.com/oven-sh/bun
 * @see https://github.com/Effect-TS/effect
 */
import {existsSync} from 'fs';
import path from 'path';
import {getCrossRef} from '../xref/index.ts';

export const GROUND_TRUTH_REPOS = {
	bun: {
		slug: 'oven-sh/bun',
		defaultBranch: 'main',
		baseUrl: 'https://github.com/oven-sh/bun',
		indexPath: 'docs/runtime/utils.mdx',
	},
	effect: {
		slug: 'Effect-TS/effect',
		defaultBranch: 'main',
		baseUrl: 'https://github.com/Effect-TS/effect',
		indexPath: 'packages/effect/README.md',
	},
} as const;

export type GroundTruthRepoId = keyof typeof GROUND_TRUTH_REPOS;

export const GROUND_TRUTH_REPO_INDEX_URLS: Record<GroundTruthRepoId, string> = {
	bun: `${GROUND_TRUTH_REPOS.bun.baseUrl}/blob/${GROUND_TRUTH_REPOS.bun.defaultBranch}/${GROUND_TRUTH_REPOS.bun.indexPath}`,
	effect: `${GROUND_TRUTH_REPOS.effect.baseUrl}/blob/${GROUND_TRUTH_REPOS.effect.defaultBranch}/${GROUND_TRUTH_REPOS.effect.indexPath}`,
};

/** Maps workflow scanner ids to xref ids with ground-truth coverage. */
export const WORKFLOW_SCANNER_GROUND_TRUTH = {
	network: 'service.network',
	semver: 'intel.semver',
	patterns: 'scan.patterns',
	tls: 'intel.tls',
	dns: 'feature.intel-dns',
} as const;

export type WorkflowScannerGroundTruthId = keyof typeof WORKFLOW_SCANNER_GROUND_TRUTH;

export interface RepoGroundTruthRef {
	repo: GroundTruthRepoId;
	path: string;
	label: string;
	symbol?: string;
}

export interface GroundTruthEntry {
	xrefId: string;
	description: string;
	localModules: readonly string[];
	refs: readonly RepoGroundTruthRef[];
	/** When true, local modules should cite upstream @see links (conformance). */
	requireModuleHeaders?: boolean;
}

export interface GroundTruthLoopStep {
	id: string;
	depth: number;
	via?: string;
	kind: 'xref' | 'repo-ref' | 'local-module';
	label?: string;
	url?: string;
}

export interface GroundTruthCatalogFinding {
	xrefId: string;
	message: string;
	severity: 'error' | 'warning';
}

export interface GroundTruthLocalModuleFinding {
	xrefId: string;
	module: string;
	message: string;
	severity: 'error' | 'warning';
}

export interface GroundTruthCatalogValidation {
	ok: boolean;
	findings: GroundTruthCatalogFinding[];
	unknownXrefIds: string[];
}

export interface GroundTruthLocalModuleAudit {
	ok: boolean;
	missingModules: GroundTruthLocalModuleFinding[];
	unlinkedModules: GroundTruthLocalModuleFinding[];
	findings: GroundTruthLocalModuleFinding[];
}

export interface GroundTruthCatalogAudit {
	ok: boolean;
	entryCount: number;
	refCount: number;
	missingXrefCoverage: string[];
	validation: GroundTruthCatalogValidation;
	localModules: GroundTruthLocalModuleAudit;
}

/** Canonical upstream references keyed by xref id. */
export const GROUND_TRUTH_CATALOG: readonly GroundTruthEntry[] = [
	{
		xrefId: 'workflow.loop',
		description: 'Continuous scanner orchestrator — watch, interval, signals, NDJSON output.',
		requireModuleHeaders: true,
		localModules: [
			'src/workflow/loop.ts',
			'src/workflow/scanners.ts',
			'src/workflow/output.ts',
			'src/cli/workflow.ts',
		],
		refs: [
			{repo: 'bun', path: 'docs/runtime/watch.mdx', label: 'Bun.watch / file watching'},
			{repo: 'bun', path: 'docs/guides/process/os-signals.mdx', label: 'graceful loop shutdown'},
			{repo: 'bun', path: 'docs/guides/process/nanoseconds.mdx', label: 'loop timing benchmarks'},
			{
				repo: 'effect',
				path: 'packages/effect/src/Schedule.ts',
				label: 'interval scheduling',
				symbol: 'Schedule',
			},
			{
				repo: 'effect',
				path: 'packages/effect/src/Layer.ts',
				label: 'service layer composition',
				symbol: 'Layer',
			},
			{
				repo: 'effect',
				path: 'packages/platform/src/Command.ts',
				label: 'CLI command orchestration',
				symbol: 'Command',
			},
		],
	},
	{
		xrefId: 'service.network',
		description: 'Dist audit loop — health probes, baseline drift, debounced watch.',
		requireModuleHeaders: true,
		localModules: ['src/network/loop.ts', 'src/network/tick.ts', 'src/cli/network.ts'],
		refs: [
			{repo: 'bun', path: 'docs/runtime/http/server.mdx', label: 'Bun.serve health endpoints'},
			{repo: 'bun', path: 'docs/runtime/watch.mdx', label: 'dist fingerprint watch'},
			{
				repo: 'effect',
				path: 'packages/effect/src/Schedule.ts',
				label: 'probe interval scheduling',
				symbol: 'Schedule.fixed',
			},
			{
				repo: 'effect',
				path: 'packages/effect/src/Deferred.ts',
				label: 'async tick coordination',
				symbol: 'Deferred',
			},
		],
	},
	{
		xrefId: 'intel.semver',
		description: 'Installed dependency versions vs unified policy semver constraints.',
		localModules: [
			'src/intel/semver-checks.ts',
			'src/provider/semver-matcher.ts',
			'src/cli/scan-packages.ts',
		],
		refs: [
			{repo: 'bun', path: 'docs/runtime/semver.mdx', label: 'Bun.semver satisfies/order'},
			{repo: 'bun', path: 'docs/cli/install.mdx', label: 'lockfile + node_modules layout'},
			{
				repo: 'effect',
				path: 'packages/effect/src/ParseResult.ts',
				label: 'structured violation reporting',
				symbol: 'ParseResult',
			},
		],
	},
	{
		xrefId: 'scan.patterns',
		description: 'AST and regex pattern rules over src/ and dist/ trees.',
		localModules: ['src/scan/patterns/index.ts', 'src/cli/scan-patterns.ts'],
		refs: [
			{repo: 'bun', path: 'docs/api/transpiler.mdx', label: 'Bun.Transpiler AST scan'},
			{repo: 'bun', path: 'docs/bundler/plugins.mdx', label: 'build-time pattern plugins'},
		],
	},
	{
		xrefId: 'feature.intel-dns',
		description: 'DNS reputation and resolution checks for feed and health hosts.',
		localModules: ['src/intel/dns-threat.ts', 'src/threat-intel/dns.ts'],
		refs: [
			{repo: 'bun', path: 'docs/api/dns.mdx', label: 'Bun DNS lookup APIs'},
			{
				repo: 'effect',
				path: 'packages/effect/src/Effect.ts',
				label: 'typed async DNS inspection',
				symbol: 'Effect',
			},
		],
	},
	{
		xrefId: 'utils.signals',
		description: 'Interrupt handling for long-running CLI loops.',
		requireModuleHeaders: true,
		localModules: ['src/utils/signals.ts', 'src/workflow/loop.ts'],
		refs: [
			{repo: 'bun', path: 'docs/guides/process/os-signals.mdx', label: 'SIGINT/SIGTERM handling'},
			{repo: 'bun', path: 'docs/guides/process/ctrl-c.mdx', label: 'Ctrl+C graceful exit'},
		],
	},
	{
		xrefId: 'intel.tls',
		description: 'Remote TLS chain inspection and system CA validation.',
		localModules: ['src/intel/tls/inspector.ts', 'src/cli/tls.ts'],
		refs: [
			{repo: 'bun', path: 'docs/api/tls.mdx', label: 'tls.connect + getCACertificates'},
			{repo: 'bun', path: 'packages/bun-types/docs/api/tls.md', label: 'TLS type definitions'},
		],
	},
	{
		xrefId: 'bun.transpiler',
		description: 'Transpiler bundle and source scanning for injected threats.',
		localModules: ['src/scan/transpiler.ts', 'src/build/security-plugin.ts'],
		refs: [
			{repo: 'bun', path: 'docs/api/transpiler.mdx', label: 'Bun.Transpiler API'},
			{repo: 'bun', path: 'docs/bundler/plugins.mdx', label: 'Bun.plugin security hooks'},
		],
	},
	{
		xrefId: 'bun.spawn',
		description: 'External scanner subprocess orchestration.',
		localModules: ['src/utils/process.ts', 'src/scan/tools.ts'],
		refs: [
			{repo: 'bun', path: 'docs/guides/process/spawn.mdx', label: 'Bun.spawn patterns'},
			{repo: 'bun', path: 'docs/runtime/child-process.mdx', label: 'PTY + inherit stdio'},
		],
	},
	{
		xrefId: 'bun.install',
		description: 'Lockfile layout and semver resolution for supply-chain scans.',
		localModules: ['src/utils/install-runtime.ts', 'src/intel/semver-checks.ts'],
		refs: [
			{repo: 'bun', path: 'docs/cli/install.mdx', label: 'bun install + lockfile'},
			{repo: 'bun', path: 'docs/pm/cli/install.mdx', label: 'workspace filter installs'},
		],
	},
	{
		xrefId: 'bun.test',
		description: 'bun:test catalog and conformance against upstream API reference.',
		localModules: ['src/utils/bun-test-catalog.ts', 'tests/conventions/bun/'],
		refs: [
			{repo: 'bun', path: 'docs/test/writing-tests.mdx', label: 'test authoring'},
			{repo: 'bun', path: 'packages/bun-types/docs/test.md', label: 'bun:test type reference'},
		],
	},
	{
		xrefId: 'utils.doctor-diagnostics',
		description: 'Doctor runtime tables aligned with Bun utility docs.',
		localModules: ['src/utils/doctor-diagnostics.ts', 'src/utils/runtime.ts'],
		refs: [
			{repo: 'bun', path: 'docs/runtime/utils.mdx', label: 'Bun utility ground truth'},
			{
				repo: 'effect',
				path: 'packages/effect/src/Inspectable.ts',
				label: 'structured diagnostic output',
				symbol: 'Inspectable',
			},
		],
	},
	{
		xrefId: 'xref.loop',
		description: 'Graph walks and catalog validation for integration audits.',
		localModules: ['src/xref/loop-cli.ts', 'src/xref/index.ts'],
		refs: [
			{
				repo: 'effect',
				path: 'packages/effect/src/Graph.ts',
				label: 'graph traversal patterns',
				symbol: 'Graph',
			},
			{repo: 'bun', path: 'docs/runtime/templating/create.mdx', label: 'artifact spec loops'},
		],
	},
	{
		xrefId: 'repo.bun',
		description: 'oven-sh/bun — primary runtime and docs ground truth.',
		localModules: [
			'src/utils/runtime.ts',
			'src/utils/ground-truth-catalog.ts',
			'tests/conventions/bun/bun-utils-conformance.test.ts',
		],
		refs: [{repo: 'bun', path: 'README.md', label: 'repository root'}],
	},
	{
		xrefId: 'repo.effect',
		description: 'Effect-TS/effect — scheduling, layers, and CLI platform patterns.',
		localModules: ['src/utils/ground-truth-catalog.ts'],
		refs: [{repo: 'effect', path: 'README.md', label: 'repository root'}],
	},
	{
		xrefId: 'ground-truth.catalog',
		description: 'This catalog — maps local modules to upstream repo references.',
		localModules: [
			'src/utils/ground-truth-catalog.ts',
			'tests/conventions/ground-truth/ground-truth-conformance.test.ts',
		],
		refs: [
			{repo: 'bun', path: 'docs/runtime/utils.mdx', label: 'doc parity pattern'},
			{repo: 'effect', path: 'packages/effect/README.md', label: 'layered architecture reference'},
		],
	},
] as const;

export const GROUND_TRUTH_REQUIRED_XREF_IDS = [
	'workflow.loop',
	'service.network',
	'intel.semver',
	'scan.patterns',
	'feature.intel-dns',
	'utils.signals',
	'intel.tls',
	'ground-truth.catalog',
	'repo.bun',
	'repo.effect',
] as const;

const PROJECT_ROOT = path.join(import.meta.dir, '..', '..');

export function formatRepoRefUrl(ref: RepoGroundTruthRef, branch?: string): string {
	const repo = GROUND_TRUTH_REPOS[ref.repo];
	const refBranch = branch ?? repo.defaultBranch;
	const fragment = ref.symbol ? `#L1` : '';
	return `${repo.baseUrl}/blob/${refBranch}/${ref.path}${fragment}`;
}

export function formatRepoRefLine(ref: RepoGroundTruthRef): string {
	const repo = GROUND_TRUTH_REPOS[ref.repo];
	return `${repo.slug}:${ref.path} — ${ref.label}`;
}

export function getGroundTruthForXref(xrefId: string): GroundTruthEntry | undefined {
	return GROUND_TRUTH_CATALOG.find(entry => entry.xrefId === xrefId);
}

export function getGroundTruthForWorkflowScanner(scannerId: string): GroundTruthEntry | undefined {
	const xrefId = WORKFLOW_SCANNER_GROUND_TRUTH[scannerId as WorkflowScannerGroundTruthId];
	return xrefId ? getGroundTruthForXref(xrefId) : undefined;
}

export function getGroundTruthForModule(modulePath: string): GroundTruthEntry | undefined {
	return GROUND_TRUTH_CATALOG.find(entry => entry.localModules.includes(modulePath));
}

export function listGroundTruthEntries(): readonly GroundTruthEntry[] {
	return GROUND_TRUTH_CATALOG;
}

export function planGroundTruthLoop(
	xrefId: string,
	options: {includeStart?: boolean} = {},
): GroundTruthLoopStep[] {
	const entry = getGroundTruthForXref(xrefId);
	if (!entry) return [];

	const steps: GroundTruthLoopStep[] = [];
	if (options.includeStart !== false) {
		steps.push({id: xrefId, depth: 0, kind: 'xref'});
	}

	for (const ref of entry.refs) {
		steps.push({
			id: `${ref.repo}:${ref.path}`,
			depth: 1,
			via: xrefId,
			kind: 'repo-ref',
			label: ref.label,
			url: formatRepoRefUrl(ref),
		});
	}

	for (const modulePath of entry.localModules) {
		if (!modulePath.startsWith('src/')) continue;
		steps.push({
			id: modulePath,
			depth: 1,
			via: xrefId,
			kind: 'local-module',
		});
	}

	return steps;
}

export function extractGithubSeeRefs(text: string): string[] {
	const refs: string[] = [];
	for (const match of text.matchAll(/@see\s+(https:\/\/github\.com\/[^\s)]+)/g)) {
		refs.push(match[1]!);
	}
	return refs;
}

export function moduleLinksGroundTruth(text: string, entry: GroundTruthEntry): boolean {
	const seeRefs = extractGithubSeeRefs(text);
	if (seeRefs.length === 0) return false;

	const slugs = new Set(entry.refs.map(ref => GROUND_TRUTH_REPOS[ref.repo].slug));
	return seeRefs.some(url => [...slugs].some(slug => url.includes(slug)));
}

export async function auditGroundTruthLocalModules(
	root: string = PROJECT_ROOT,
): Promise<GroundTruthLocalModuleAudit> {
	const findings: GroundTruthLocalModuleFinding[] = [];
	const missingModules: GroundTruthLocalModuleFinding[] = [];
	const unlinkedModules: GroundTruthLocalModuleFinding[] = [];

	for (const entry of GROUND_TRUTH_CATALOG) {
		for (const modulePath of entry.localModules) {
			if (!modulePath.startsWith('src/')) continue;

			const fullPath = path.join(root, modulePath);
			if (!existsSync(fullPath)) {
				const finding: GroundTruthLocalModuleFinding = {
					xrefId: entry.xrefId,
					module: modulePath,
					message: `missing local module "${modulePath}"`,
					severity: 'error',
				};
				findings.push(finding);
				missingModules.push(finding);
				continue;
			}

			if (!entry.requireModuleHeaders) continue;

			const text = await Bun.file(fullPath).text();
			if (!moduleLinksGroundTruth(text, entry)) {
				const finding: GroundTruthLocalModuleFinding = {
					xrefId: entry.xrefId,
					module: modulePath,
					message: `module missing @see github.com ground-truth link`,
					severity: 'warning',
				};
				findings.push(finding);
				unlinkedModules.push(finding);
			}
		}
	}

	const errors = findings.filter(finding => finding.severity === 'error');
	return {
		ok: errors.length === 0,
		missingModules,
		unlinkedModules,
		findings,
	};
}

export function validateGroundTruthLoopSteps(
	steps: readonly GroundTruthLoopStep[],
): GroundTruthCatalogValidation {
	const findings: GroundTruthCatalogFinding[] = [];

	for (const step of steps) {
		if (step.kind === 'xref' && !getGroundTruthForXref(step.id)) {
			findings.push({
				xrefId: step.id,
				message: 'unknown ground-truth xref id',
				severity: 'error',
			});
		}
		if (step.kind === 'repo-ref' && !step.url) {
			findings.push({
				xrefId: step.via ?? step.id,
				message: `repo ref "${step.id}" missing url`,
				severity: 'error',
			});
		}
	}

	const errors = findings.filter(finding => finding.severity === 'error');
	return {ok: errors.length === 0, findings, unknownXrefIds: []};
}

export function validateGroundTruthCatalog(
	xrefExists: (id: string) => boolean = id => getCrossRef(id) !== undefined,
): GroundTruthCatalogValidation {
	const findings: GroundTruthCatalogFinding[] = [];
	const unknownXrefIds: string[] = [];

	for (const entry of GROUND_TRUTH_CATALOG) {
		if (!xrefExists(entry.xrefId)) {
			unknownXrefIds.push(entry.xrefId);
			findings.push({
				xrefId: entry.xrefId,
				message: `unknown xref id "${entry.xrefId}"`,
				severity: 'error',
			});
		}
		for (const ref of entry.refs) {
			if (!ref.path.trim()) {
				findings.push({
					xrefId: entry.xrefId,
					message: `empty repo path for ${ref.label}`,
					severity: 'error',
				});
			}
			if (!(ref.repo in GROUND_TRUTH_REPOS)) {
				findings.push({
					xrefId: entry.xrefId,
					message: `unknown repo "${ref.repo}"`,
					severity: 'error',
				});
			}
		}
	}

	for (const scannerId of Object.keys(WORKFLOW_SCANNER_GROUND_TRUTH)) {
		const xrefId = WORKFLOW_SCANNER_GROUND_TRUTH[scannerId as WorkflowScannerGroundTruthId];
		if (!getGroundTruthForXref(xrefId)) {
			findings.push({
				xrefId: scannerId,
				message: `workflow scanner "${scannerId}" maps to missing ground truth xref "${xrefId}"`,
				severity: 'error',
			});
		}
	}

	const errors = findings.filter(finding => finding.severity === 'error');
	return {ok: errors.length === 0, findings, unknownXrefIds};
}

export async function auditGroundTruthCatalog(
	root: string = PROJECT_ROOT,
	xrefExists: (id: string) => boolean = id => getCrossRef(id) !== undefined,
): Promise<GroundTruthCatalogAudit> {
	const validation = validateGroundTruthCatalog(xrefExists);
	const localModules = await auditGroundTruthLocalModules(root);
	const covered = new Set(GROUND_TRUTH_CATALOG.map(entry => entry.xrefId));
	const missingXrefCoverage = GROUND_TRUTH_REQUIRED_XREF_IDS.filter(id => !covered.has(id));
	const refCount = GROUND_TRUTH_CATALOG.reduce((sum, entry) => sum + entry.refs.length, 0);

	return {
		ok: validation.ok && missingXrefCoverage.length === 0 && localModules.ok,
		entryCount: GROUND_TRUTH_CATALOG.length,
		refCount,
		missingXrefCoverage: [...missingXrefCoverage],
		validation,
		localModules,
	};
}

export function formatGroundTruthTable(
	entries: readonly GroundTruthEntry[] = GROUND_TRUTH_CATALOG,
): string {
	const lines = ['Ground truth (upstream repo references):'];
	for (const entry of entries) {
		lines.push(`  ${entry.xrefId}: ${entry.description}`);
		for (const ref of entry.refs) {
			lines.push(`    ${formatRepoRefLine(ref)}`);
			lines.push(`      ${formatRepoRefUrl(ref)}`);
		}
		for (const modulePath of entry.localModules) {
			if (modulePath.startsWith('src/')) {
				lines.push(`    local: ${modulePath}`);
			}
		}
	}
	return lines.join('\n');
}

export function formatGroundTruthLoopTable(steps: readonly GroundTruthLoopStep[]): string {
	const lines = ['Ground-truth loop:'];
	for (const step of steps) {
		const via = step.via ? ` via ${step.via}` : '';
		const label = step.label ? ` — ${step.label}` : '';
		lines.push(`  ${'  '.repeat(step.depth)}${step.id} (${step.kind}${via})${label}`);
		if (step.url) {
			lines.push(`  ${'  '.repeat(step.depth)}  ${step.url}`);
		}
	}
	return lines.join('\n');
}
