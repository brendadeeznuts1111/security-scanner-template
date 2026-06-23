/**
 * Per-domain package init plans aligned with `bun init` and golden templates.
 * @see https://bun.com/docs/runtime/templating/init
 */
import path from 'path';
import {discoverDomainFiles, loadDomainConfigSurface} from '../config/loader.ts';
import {BUN_INIT_DOCS_URL} from '../utils/bun-create-catalog.ts';

export type DomainPackageArtifactKind = 'package' | 'json5' | 'directory';

export interface DomainPackageArtifact {
	relativePath: string;
	kind: DomainPackageArtifactKind;
	required: boolean;
}

export interface DomainPackageInitPlan {
	domain: string;
	packageName: string;
	configPath: string;
	securityDir: string;
	artifacts: readonly DomainPackageArtifact[];
}

export interface DomainPackageInitFinding {
	domain: string;
	kind: 'basename-mismatch' | 'missing-config' | 'domain-field-mismatch';
	message: string;
	severity: 'error' | 'warning';
}

export interface DomainPackageInitValidation {
	ok: boolean;
	plans: DomainPackageInitPlan[];
	findings: DomainPackageInitFinding[];
}

export interface DomainPackageInitAudit {
	ok: boolean;
	domainCount: number;
	plans: DomainPackageInitPlan[];
	validation: DomainPackageInitValidation;
}

/** Reverse-DNS domain id to scoped npm package name for workspace init. */
export function domainIdToPackageName(domain: string): string {
	const parts = domain.split('.');
	if (parts.length < 2) {
		return domain;
	}
	const scope = parts.slice(0, -1).join('-');
	const leaf = parts[parts.length - 1];
	return `@${scope}/${leaf}-security`;
}

/** Expected domains/<domain>.security.json5 basename. */
export function domainConfigBasename(domain: string): string {
	return `${domain}.security.json5`;
}

/** Workspace-relative directory for a per-domain package (`packages/<leaf>-security`). */
export function domainPackageDir(domain: string): string {
	const leaf = domain.split('.').pop() ?? domain;
	return `packages/${leaf}-security`;
}

/** Artifact set for one domain package (config + optional security store). */
export function planDomainPackageInit(domain: string, configPath: string): DomainPackageInitPlan {
	const securityDir = `.security/${domain}`;
	return {
		domain,
		packageName: domainIdToPackageName(domain),
		configPath,
		securityDir,
		artifacts: [
			{relativePath: configPath, kind: 'json5', required: true},
			{relativePath: securityDir, kind: 'directory', required: false},
			{relativePath: `${securityDir}/audit.jsonl.enc`, kind: 'json5', required: false},
			{relativePath: `${securityDir}/network-baseline.json5`, kind: 'json5', required: false},
		],
	};
}

/** Minimal package.json body for `bun init` in a per-domain workspace package. */
export function buildDomainPackageJson(plan: DomainPackageInitPlan): Record<string, unknown> {
	return {
		name: plan.packageName,
		private: true,
		type: 'module',
		description: `Security domain package for ${plan.domain}`,
		scripts: {
			'doctor': 'bun sp doctor --root .. --matrix',
			'network-start': `bun sp network start --domain ${plan.domain}`,
		},
	};
}

/** Format a non-interactive `bun init` command for a domain package directory. */
export function formatBunInitCommand(packageDir: string, options: {yes?: boolean} = {}): string {
	const flag = options.yes === false ? '' : ' --yes';
	return `bun init${flag} ${JSON.stringify(packageDir)}`;
}

/** Discover init plans for every domain config under `root`. */
export async function discoverDomainPackageInits(root: string): Promise<DomainPackageInitPlan[]> {
	const plans: DomainPackageInitPlan[] = [];
	for (const filePath of discoverDomainFiles(root)) {
		const config = await loadDomainConfigSurface(filePath);
		const rel = path.relative(root, filePath).replaceAll('\\', '/');
		plans.push(planDomainPackageInit(config.domain, rel));
	}
	return plans.sort((a, b) => a.domain.localeCompare(b.domain));
}

/** Validate domain config basenames and `domain` field alignment. */
export async function validateDomainPackageInits(
	root: string,
): Promise<DomainPackageInitValidation> {
	const plans = await discoverDomainPackageInits(root);
	const findings: DomainPackageInitFinding[] = [];

	for (const plan of plans) {
		const basename = path.basename(plan.configPath);
		const expected = domainConfigBasename(plan.domain);
		if (basename !== expected) {
			findings.push({
				domain: plan.domain,
				kind: 'basename-mismatch',
				message: `config basename "${basename}" !== "${expected}"`,
				severity: 'warning',
			});
		}

		const fullPath = path.join(root, plan.configPath);
		const file = Bun.file(fullPath);
		if (!(await file.exists())) {
			findings.push({
				domain: plan.domain,
				kind: 'missing-config',
				message: `missing config at ${plan.configPath}`,
				severity: 'error',
			});
			continue;
		}

		const config = await loadDomainConfigSurface(fullPath);
		if (config.domain !== plan.domain) {
			findings.push({
				domain: plan.domain,
				kind: 'domain-field-mismatch',
				message: `domain field "${config.domain}" !== plan domain "${plan.domain}"`,
				severity: 'error',
			});
		}
	}

	const errors = findings.filter(finding => finding.severity === 'error');
	return {ok: errors.length === 0, plans, findings};
}

/** Audit per-domain package init conformance for doctor / xref. */
export async function auditDomainPackageInits(root: string): Promise<DomainPackageInitAudit> {
	const validation = await validateDomainPackageInits(root);
	return {
		ok: validation.ok,
		domainCount: validation.plans.length,
		plans: validation.plans,
		validation,
	};
}

export function isBunInitCatalogAvailable(): boolean {
	return typeof Bun !== 'undefined';
}

export {BUN_INIT_DOCS_URL};
