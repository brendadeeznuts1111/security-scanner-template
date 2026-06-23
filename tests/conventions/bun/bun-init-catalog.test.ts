import path from 'path';
import {expect, test} from 'bun:test';
import {
	auditDomainPackageInits,
	buildDomainPackageJson,
	discoverDomainPackageInits,
	domainConfigBasename,
	domainIdToPackageName,
	domainPackageDir,
	formatBunInitCommand,
	planDomainPackageInit,
	validateDomainPackageInits,
} from '../../../src/domain/bun-init-catalog.ts';

const ROOT = path.join(import.meta.dir, '../../..');

test('domainIdToPackageName maps reverse-DNS to scoped package name', () => {
	expect(domainIdToPackageName('com.factory-wager.shadow')).toBe(
		'@com-factory-wager/shadow-security',
	);
	expect(domainConfigBasename('com.example.service')).toBe('com.example.service.security.json5');
	expect(domainPackageDir('com.example.service')).toBe('packages/service-security');
});

test('planDomainPackageInit lists config and security artifacts', () => {
	const plan = planDomainPackageInit(
		'com.example.service',
		'domains/com.example.service.security.json5',
	);
	expect(plan.packageName).toBe('@com-example/service-security');
	expect(plan.artifacts.some(artifact => artifact.relativePath === plan.configPath)).toBe(true);
	expect(
		plan.artifacts.some(artifact => artifact.relativePath === '.security/com.example.service'),
	).toBe(true);
});

test('buildDomainPackageJson includes doctor and network scripts', () => {
	const plan = planDomainPackageInit(
		'com.example.service',
		'domains/com.example.service.security.json5',
	);
	const pkg = buildDomainPackageJson(plan);
	expect(pkg.name).toBe('@com-example/service-security');
	expect((pkg.scripts as Record<string, string>).doctor).toContain('bun sp doctor');
	expect((pkg.scripts as Record<string, string>)['network-start']).toContain('com.example.service');
});

test('formatBunInitCommand quotes package directory', () => {
	expect(formatBunInitCommand('packages/service-security')).toBe(
		'bun init --yes "packages/service-security"',
	);
});

test('discoverDomainPackageInits finds repo domain configs', async () => {
	const plans = await discoverDomainPackageInits(ROOT);
	expect(plans.length).toBeGreaterThan(0);
	expect(plans.every(plan => plan.configPath.startsWith('domains/'))).toBe(true);
});

test('validateDomainPackageInits passes for checked-in domains', async () => {
	const result = await validateDomainPackageInits(ROOT);
	expect(result.ok).toBe(true);
	expect(result.findings.filter(finding => finding.severity === 'error')).toEqual([]);
});

test('auditDomainPackageInits summarizes domain package count', async () => {
	const audit = await auditDomainPackageInits(ROOT);
	expect(audit.ok).toBe(true);
	expect(audit.domainCount).toBe(audit.plans.length);
	expect(audit.domainCount).toBeGreaterThan(0);
});
