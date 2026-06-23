import path from 'path';
import {expect, test} from 'bun:test';
import {executeLoopCli} from '../../src/xref/loop-cli.ts';

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