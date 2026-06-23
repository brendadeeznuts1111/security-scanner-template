import {expect, test} from 'bun:test';
import {checkAllDomains} from '../../src/config/doctor.ts';
import {
	collectDoctorDiagnostics,
	createDoctorTimingSnapshot,
	doctorDiagnosticsInspectable,
	formatDoctorDiagnosticsInspect,
	formatDoctorDiagnosticsTable,
	getDoctorUtilityRuntime,
} from '../../src/utils/doctor-diagnostics.ts';
import {INSPECT_CUSTOM, isInspectCustomAvailable} from '../../src/utils/inspect-custom.ts';
import {createTimer} from '../../src/utils/timing.ts';

test('getDoctorUtilityRuntime reports Bun timing and terminal APIs', () => {
	const utilities = getDoctorUtilityRuntime();
	expect(utilities.nanosecondsAvailable).toBe(typeof Bun.nanoseconds === 'function');
	expect(utilities.stringWidthAvailable).toBe(typeof Bun.stringWidth === 'function');
	expect(utilities.inspectCustomAvailable).toBe(isInspectCustomAvailable());
});

test('formatDoctorDiagnosticsTable includes nanoseconds and stringWidth rows', () => {
	const table = formatDoctorDiagnosticsTable();
	expect(table).toContain('Bun.nanoseconds');
	expect(table).toContain('Bun.stringWidth');
	expect(table).toContain('inspect.custom');
	expect(table).toContain('SIGINT');
});

test('inspect.custom renders diagnostics table', () => {
	const inspectable = doctorDiagnosticsInspectable();
	expect(INSPECT_CUSTOM in inspectable).toBe(true);
	const rendered = formatDoctorDiagnosticsInspect();
	expect(rendered).toContain('Bun.spawn');
});

test('createDoctorTimingSnapshot uses Bun.nanoseconds elapsed time', async () => {
	const timer = createTimer();
	await Bun.sleep(1);
	const timing = createDoctorTimingSnapshot(timer.elapsedNs());
	expect(timing.elapsedNs).toBeGreaterThan(0);
	expect(timing.elapsedMs).toBeGreaterThanOrEqual(0);
	expect(timing.monotonicNs).toBeGreaterThan(0);
});

test('checkAllDomains includes runtime diagnostics', async () => {
	const root = `/tmp/doctor-diag-${Date.now()}`;
	const {mkdir, rm} = await import('fs/promises');
	await mkdir(`${root}/domains`, {recursive: true});
	await Bun.write(
		`${root}/domains/app.security.json5`,
		'{ domain: "com.example.diag", csrf: { enabled: false, tokenLength: 32 } }',
	);
	try {
		const result = await checkAllDomains(root);
		expect(result.runtime.diagnostics.utilities.nanosecondsAvailable).toBe(true);
		expect(result.runtime.diagnostics.signals.interruptSignals).toContain('SIGINT');
		expect(collectDoctorDiagnostics().process.bunVersion).toBe(Bun.version);
	} finally {
		await rm(root, {recursive: true, force: true});
	}
});
