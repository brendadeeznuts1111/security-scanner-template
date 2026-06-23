import {expect, test, afterEach} from 'bun:test';
import {checkDomain} from '../../src/config/doctor.ts';
import {applyDefaults} from '../../src/config/defaults.ts';
import type {LoadedDomain} from '../../src/config/loader.ts';
import {INTERACTIVE_FORCE_ENV} from '../../src/utils/process.ts';

function loadedFixture(config: ReturnType<typeof applyDefaults>): LoadedDomain {
	return {
		domain: config.domain,
		path: '/tmp/test.security.json5',
		config,
	};
}

const prevForce = process.env[INTERACTIVE_FORCE_ENV];

afterEach(() => {
	if (prevForce === undefined) {
		delete process.env[INTERACTIVE_FORCE_ENV];
	} else {
		process.env[INTERACTIVE_FORCE_ENV] = prevForce;
	}
});

test('checkDomain warns when service.interactive is enabled outside a TTY session', () => {
	delete process.env[INTERACTIVE_FORCE_ENV];

	const result = checkDomain(
		loadedFixture(
			applyDefaults({
				domain: 'com.example.interactive-doctor',
				service: {interactive: true},
			}),
		),
	);

	if (process.stdin.isTTY && process.stdout.isTTY) {
		expect(result.issues.some(i => i.code === 'INTERACTIVE_NON_TTY')).toBe(false);
		return;
	}

	expect(
		result.issues.some(
			i => i.code === 'INTERACTIVE_NON_TTY' && i.field === 'service.interactive',
		),
	).toBe(true);
});

test('checkDomain skips interactive TTY warning when force env is set', () => {
	process.env[INTERACTIVE_FORCE_ENV] = '1';

	const result = checkDomain(
		loadedFixture(
			applyDefaults({
				domain: 'com.example.interactive-forced',
				service: {interactive: true},
			}),
		),
	);

	expect(result.issues.some(i => i.code === 'INTERACTIVE_NON_TTY')).toBe(false);
});