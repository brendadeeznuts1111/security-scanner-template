#!/usr/bin/env bun
import {parseArgs} from 'util';
import {runConfigDoctor} from './config-doctor.ts';
import {isMainModule} from '../utils/runtime.ts';

async function main(): Promise<void> {
	const parsed = parseArgs({
		args: Bun.argv,
		options: {
			'root': {type: 'string'},
			'json': {type: 'boolean'},
			'benchmark': {type: 'boolean'},
			'check-peer-meta': {type: 'boolean'},
			'install-cpu': {type: 'string'},
			'install-os': {type: 'string'},
			'matrix': {type: 'boolean'},
			'branding': {type: 'boolean'},
			'snapshot': {type: 'boolean'},
			'update-snapshots': {type: 'boolean', short: 'u'},
			'matrix-section': {type: 'string'},
			'baseline-dir': {type: 'string'},
			'fail-on-drift': {type: 'boolean'},
			'sections': {type: 'string'},
			'workers': {type: 'string'},
		},
		strict: false,
		allowPositionals: true,
	});

	const root = typeof parsed.values.root === 'string' ? parsed.values.root : undefined;
	const json = parsed.values.json === true;

	const matrixSection =
		typeof parsed.values['matrix-section'] === 'string'
			? parsed.values['matrix-section']
			: undefined;

	await runConfigDoctor({
		root,
		json,
		argv: Bun.argv,
		benchmark: parsed.values.benchmark === true,
		checkPeerMeta: parsed.values['check-peer-meta'] === true,
		installCpu:
			typeof parsed.values['install-cpu'] === 'string' ? parsed.values['install-cpu'] : undefined,
		installOs:
			typeof parsed.values['install-os'] === 'string' ? parsed.values['install-os'] : undefined,
		matrix: parsed.values.matrix === true,
		branding: parsed.values.branding === true,
		snapshot:
			parsed.values.snapshot === true ||
			parsed.values['update-snapshots'] === true ||
			parsed.values['fail-on-drift'] === true,
		updateSnapshots: parsed.values['update-snapshots'] === true,
		baselineDir:
			typeof parsed.values['baseline-dir'] === 'string' ? parsed.values['baseline-dir'] : undefined,
		failOnDrift: parsed.values['fail-on-drift'] === true,
		driftSections: typeof parsed.values.sections === 'string' ? parsed.values.sections : undefined,
		workers:
			typeof parsed.values.workers === 'string'
				? Number.parseInt(parsed.values.workers, 10)
				: undefined,
		matrixSection:
			matrixSection &&
			[
				'domain',
				'branding',
				'secrets',
				'identity',
				'token',
				'csrf',
				'supply-chain',
				'service',
				'visual',
				'ops',
				'audit',
				'intel',
				'tls',
				'errors',
			].includes(matrixSection)
				? (matrixSection as import('../domain/field-matrix.ts').DomainFieldSection)
				: undefined,
	});
}

const __doctorCliMain =
	isMainModule() ||
	(process.argv[1]?.includes('doctor.ts') ?? false) ||
	(Bun.argv[1]?.includes('doctor.ts') ?? false);

if (__doctorCliMain) {
	await main();
}
