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

test('formatDoctorDiagnosticsTable includes nanoseconds and stringWidth rows', async () => {
	const table = formatDoctorDiagnosticsTable(await collectDoctorDiagnostics());
	expect(table).toContain('Bun.nanoseconds');
	expect(table).toContain('Bun.stringWidth');
	expect(table).toContain('inspect.custom');
	expect(table).toContain('SIGINT');
	expect(table).toContain('Bun.deepEquals');
	expect(table).toContain('Bun.escapeHTML');
	expect(table).toContain('bun:test Runner');
	expect(table).toContain('bun:test Core expect matchers');
	expect(table).toContain('bun create artifacts');
	expect(table).toContain('bun init domains');
	expect(table).toContain('DD-Loop');
	expect(table).toContain('repo refs');
	expect(table).toContain('ground-truth');
});

test('collectDoctorDiagnostics includes ground truth repo audit and goal', async () => {
	const diagnostics = await collectDoctorDiagnostics();
	expect(diagnostics.groundTruth.ok).toBe(true);
	expect(diagnostics.groundTruth.entryCount).toBeGreaterThan(0);
	expect(diagnostics.groundTruth.refCount).toBeGreaterThan(0);
	expect(diagnostics.groundTruthGoal.ok).toBe(true);
	expect(diagnostics.groundTruthGoal.targets.length).toBeGreaterThan(3);
});

test('collectDoctorDiagnostics includes bun wrapper and test catalog audits', async () => {
	const diagnostics = await collectDoctorDiagnostics();
	expect(diagnostics.bunWrappers.entries.length).toBeGreaterThan(5);
	expect(diagnostics.bunTest.ok).toBe(true);
	expect(diagnostics.bunTest.groups.length).toBeGreaterThan(3);
	expect(diagnostics.bunCreate.ok).toBe(true);
	expect(diagnostics.bunInit.ok).toBe(true);
	expect(diagnostics.loops.ok).toBe(true);
	expect(diagnostics.loops.seeds.length).toBeGreaterThan(0);
	expect(diagnostics.utilities.deepEqualsAvailable).toBe(true);
	expect(diagnostics.utilities.peekAvailable).toBe(true);
	expect(diagnostics.utilities.escapeHtmlAvailable).toBe(true);
});

test('inspect.custom renders diagnostics table', async () => {
	const diagnostics = await collectDoctorDiagnostics();
	const inspectable = doctorDiagnosticsInspectable(diagnostics);
	expect(INSPECT_CUSTOM in inspectable).toBe(true);
	const rendered = formatDoctorDiagnosticsInspect(diagnostics);
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
		expect((await collectDoctorDiagnostics()).process.bunVersion).toBe(Bun.version);
	} finally {
		await rm(root, {recursive: true, force: true});
	}
});
