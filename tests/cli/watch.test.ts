import {expect, test, beforeEach, afterEach} from 'bun:test';
import {createDebouncer, startWatch} from '../../src/cli/watch.ts';

const TEST_DIR = `/tmp/watch-test-${Date.now()}`;

beforeEach(async () => {
	await Bun.write(TEST_DIR, '').catch(() => {});
	const {rm, mkdir, writeFile} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
	await mkdir(TEST_DIR, {recursive: true});
	await writeFile(
		`${TEST_DIR}/package.json`,
		JSON.stringify({dependencies: {'safe-pkg': '1.0.0'}}),
	);
	await writeFile(`${TEST_DIR}/bun.lockb`, '');
});

afterEach(async () => {
	const {rm} = await import('fs/promises');
	await rm(TEST_DIR, {recursive: true, force: true});
});

test('createDebouncer only invokes fn once after multiple rapid calls', async () => {
	let calls = 0;
	const debounced = createDebouncer(() => {
		calls++;
	}, 50);

	debounced();
	debounced();
	debounced();

	expect(calls).toBe(0);
	await new Promise(resolve => setTimeout(resolve, 100));
	expect(calls).toBe(1);
});

test('startWatch returns a session that can be aborted', async () => {
	const cwd = process.cwd();
	process.chdir(TEST_DIR);
	try {
		const session = startWatch({debounceMs: 50});
		expect(session.watchers.length).toBe(2);
		session.abort();
	} finally {
		process.chdir(cwd);
	}
});
