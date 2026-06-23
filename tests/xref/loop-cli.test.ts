import path from 'path';
import {expect, test} from 'bun:test';
import {
	auditDoctorLoops,
	DOCTOR_LOOP_SEEDS,
	executeLoopCli,
	executeLoopCliAsync,
} from '../../src/xref/loop-cli.ts';

const ROOT = path.join(import.meta.dir, '../..');

test('executeLoopCli dry-run plans xref loop without entries', () => {
	const result = executeLoopCli({
		id: 'bun.nanoseconds',
		kind: 'xref',
		maxDepth: 1,
		dryRun: true,
	});
	expect(result.dryRun).toBe(true);
	expect(result.entries).toBeUndefined();
	expect(result.steps.length).toBeGreaterThan(0);
	expect(result.steps.every(step => step.depth <= 1)).toBe(true);
});

test('executeLoopCli artifact kind walks template spec graph', () => {
	const result = executeLoopCli({
		id: 'domain.template',
		kind: 'artifact',
		maxDepth: 1,
		bidirectional: true,
	});
	expect(result.kind).toBe('artifact');
	expect(result.steps.map(step => step.id)).toContain('domain.template');
	expect(result.steps.map(step => step.id)).toContain('network-baseline.template');
});

test('executeLoopCli validate checks artifact files on disk', () => {
	const result = executeLoopCli({
		id: 'domain.template',
		kind: 'artifact',
		validate: true,
		root: ROOT,
	});
	expect(result.validation?.ok).toBe(true);
	expect(result.validation?.findings).toEqual([]);
});

test('executeLoopCli benchmark attaches nanosecond timing', () => {
	const result = executeLoopCli({
		id: 'bun.test',
		kind: 'xref',
		maxDepth: 1,
		benchmark: true,
	});
	expect(result.benchmarkNs).toBeGreaterThan(0);
});

test('executeLoopCliAsync domain-init lists all domain packages', async () => {
	const result = await executeLoopCliAsync({
		id: '*',
		kind: 'domain-init',
		validate: true,
		root: ROOT,
	});
	expect(result.kind).toBe('domain-init');
	expect(result.count).toBeGreaterThan(0);
	expect(result.validation?.ok).toBe(true);
});

test('auditDoctorLoops runs DD-Loop canonical seeds', async () => {
	const audit = await auditDoctorLoops(ROOT, {dryRun: true});
	expect(audit.seeds.length).toBe(DOCTOR_LOOP_SEEDS.length);
	expect(audit.ok).toBe(true);
	expect(audit.totalNs).toBeGreaterThan(0);
});

test('executeLoopCliAsync ground-truth kind plans workflow.loop refs', async () => {
	const result = await executeLoopCliAsync({
		id: 'workflow.loop',
		kind: 'ground-truth',
		validate: true,
	});
	expect(result.kind).toBe('ground-truth');
	expect(result.steps.some(step => step.id.startsWith('bun:'))).toBe(true);
	expect(result.steps.some(step => step.id.startsWith('effect:'))).toBe(true);
});

test('executeLoopCli walks workflow.loop xref graph', () => {
	const result = executeLoopCli({
		id: 'workflow.loop',
		kind: 'xref',
		maxDepth: 1,
		includeStart: true,
	});
	expect(result.steps.map(step => step.id)).toContain('workflow.loop');
	expect(result.steps.map(step => step.id)).toContain('service.network');
});

test('executeLoopCli no-include-start omits depth-0 step', () => {
	const withStart = executeLoopCli({
		id: 'domain.template',
		kind: 'artifact',
		includeStart: true,
		maxDepth: 0,
	});
	const withoutStart = executeLoopCli({
		id: 'domain.template',
		kind: 'artifact',
		includeStart: false,
		maxDepth: 0,
	});
	expect(withStart.steps.some(step => step.id === 'domain.template')).toBe(true);
	expect(withoutStart.steps.some(step => step.id === 'domain.template')).toBe(false);
});
