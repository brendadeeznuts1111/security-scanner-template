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
		matrix: parsed.values.matrix === true,
		branding: parsed.values.branding === true,
		snapshot: parsed.values.snapshot === true || parsed.values['update-snapshots'] === true,
		updateSnapshots: parsed.values['update-snapshots'] === true,
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
