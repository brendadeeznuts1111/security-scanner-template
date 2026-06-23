#!/usr/bin/env bun
import {bench, run} from '../runner.mjs';
import {discoverDomainFiles, loadAllDomains, loadTemplate} from '../../src/config/loader.ts';

const root = process.env.BENCH_ROOT ?? process.cwd();

bench('domain-load.discover', () => {
	discoverDomainFiles(root);
});

bench('domain-load.loadTemplate', async () => {
	await loadTemplate();
});

bench('domain-load.loadAllDomains', async () => {
	await loadAllDomains(root);
});

await run();
