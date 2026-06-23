import {expect, test} from 'bun:test';
import {checkAllDomains} from '../../src/config/doctor.ts';
import {MIN_BUN_TYPES_FFI_TSGo_FIX, MIN_BUN_WINDOWS_RUNTIME_FIX} from '../../src/utils/platform-runtime.ts';

test('checkAllDomains includes platform runtime in report', async () => {
	const result = await checkAllDomains(process.cwd());
	expect(result.runtime.platform.platform).toBe(process.platform);
	expect(result.runtime.platform.bunTypesVersion).toBeTruthy();

	if (process.platform === 'win32' && !Bun.semver.satisfies(Bun.version, `>=${MIN_BUN_WINDOWS_RUNTIME_FIX}`)) {
		expect(
			result.crossDomainIssues.some(i => i.code === 'WINDOWS_RUNTIME_UPGRADE'),
		).toBe(true);
	}

	if (!result.runtime.platform.bunTypesTsgoCompatible) {
		expect(result.crossDomainIssues.some(i => i.code === 'BUN_TYPES_TSGo')).toBe(true);
	} else {
		expect(
			result.crossDomainIssues.some(i => i.code === 'BUN_TYPES_TSGo'),
		).toBe(false);
	}
});

test('checkAllDomains documents pipeline pager fix in terminalIO when piped', async () => {
	const result = await checkAllDomains(process.cwd());
	if (result.runtime.terminalIO.pipelineProducer) {
		expect(result.runtime.terminalIO.pipelinePagerSafe).toBe(
			Bun.semver.satisfies(Bun.version, '>=1.3.14'),
		);
	}
});