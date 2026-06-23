#!/usr/bin/env bun
import {bench, run} from '../runner.mjs';
import {checkAllDomains} from '../../src/config/doctor.ts';

const root = process.env.BENCH_ROOT ?? process.cwd();

bench('doctor.checkAllDomains', async () => {
	await checkAllDomains(root, {peerMeta: false});
});

bench('doctor.checkAllDomains.matrix', async () => {
	await checkAllDomains(root, {peerMeta: false, matrix: true, matrixSection: 'branding'});
});

await run();
