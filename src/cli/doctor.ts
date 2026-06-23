#!/usr/bin/env bun
import {parseArgs} from 'util';
import {runConfigDoctor} from './config-doctor.ts';
import {runCliIfMain} from '../utils/cli.ts';

async function main(): Promise<void> {
	const parsed = parseArgs({
		args: Bun.argv,
		options: {
			root: {type: 'string'},
			json: {type: 'boolean'},
			benchmark: {type: 'boolean'},
			'check-peer-meta': {type: 'boolean'},
		},
		strict: false,
		allowPositionals: true,
	});

	const root = typeof parsed.values.root === 'string' ? parsed.values.root : undefined;
	const json = parsed.values.json === true;

	await runConfigDoctor({
		root,
		json,
		benchmark: parsed.values.benchmark === true,
		checkPeerMeta: parsed.values['check-peer-meta'] === true,
	});
}

await runCliIfMain(main);
