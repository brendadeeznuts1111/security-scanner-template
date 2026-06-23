/**
 * Doctor / CLI runtime diagnostics: process spawn, OS signals, Bun.nanoseconds,
 * Bun.stringWidth, and Bun.inspect.custom formatters.
 */

import {
	auditBunRuntimeCatalog,
	type BunRuntimeCatalogAudit,
} from './bun-runtime-catalog.ts';
import {auditBunTestCatalog, type BunTestCatalogAudit} from './bun-test-catalog.ts';
import {formatTable} from './inspect.ts';
import {formatInspectCustom, withInspectCustom, isInspectCustomAvailable} from './inspect-custom.ts';
import {getProcessRuntimeInfo, isSpawnAvailable, type ProcessRuntimeInfo} from './process.ts';
import {
	BUN_CTRL_C_DOCS_URL,
	BUN_OS_SIGNALS_DOCS_URL,
	getSignalRuntimeInfo,
	type SignalRuntimeInfo,
} from './signals.ts';
import {stringWidth} from './terminal.ts';
import {isNanosecondsAvailable, nanoseconds} from './nanoseconds.ts';
import {isDeepEqualAvailable} from './deep-equal.ts';
import {isEscapeHtmlAvailable} from './escape-html.ts';
import {isPeekAvailable} from './peek.ts';
import {shouldColorize} from './process.ts';

export interface DoctorProcessSnapshot {
	spawnAvailable: boolean;
	spawnSyncAvailable: boolean;
	interactiveSession: boolean;
	stdinIsTTY: boolean;
	stdoutIsTTY: boolean;
	stderrIsTTY: boolean;
	bunVersion: string;
}

export interface DoctorUtilityRuntime {
	deepEqualsAvailable: boolean;
	peekAvailable: boolean;
	escapeHtmlAvailable: boolean;
	nanosecondsAvailable: boolean;
	stringWidthAvailable: boolean;
	inspectCustomAvailable: boolean;
}

export interface DoctorDiagnostics {
	process: DoctorProcessSnapshot;
	signals: SignalRuntimeInfo;
	utilities: DoctorUtilityRuntime;
	bunWrappers: BunRuntimeCatalogAudit;
	bunTest: BunTestCatalogAudit;
}

export interface DoctorTimingSnapshot {
	elapsedNs: number;
	elapsedMs: number;
	monotonicNs: number;
}

/** Snapshot aligned Bun utility wrapper availability. */
export function getDoctorUtilityRuntime(): DoctorUtilityRuntime {
	return {
		deepEqualsAvailable: isDeepEqualAvailable(),
		peekAvailable: isPeekAvailable(),
		escapeHtmlAvailable: isEscapeHtmlAvailable(),
		nanosecondsAvailable: isNanosecondsAvailable(),
		stringWidthAvailable: typeof Bun.stringWidth === 'function',
		inspectCustomAvailable: isInspectCustomAvailable(),
	};
}

/** Collect process, signal, and utility diagnostics for doctor / CLI JSON. */
export function collectDoctorDiagnostics(
	processInfo: ProcessRuntimeInfo = getProcessRuntimeInfo(),
): DoctorDiagnostics {
	return {
		process: {
			spawnAvailable: isSpawnAvailable(),
			spawnSyncAvailable: processInfo.spawnSyncAvailable,
			interactiveSession: processInfo.interactiveSession,
			stdinIsTTY: processInfo.stdinIsTTY,
			stdoutIsTTY: processInfo.stdoutIsTTY,
			stderrIsTTY: processInfo.stderrIsTTY,
			bunVersion: processInfo.bunVersion,
		},
		signals: getSignalRuntimeInfo(),
		utilities: getDoctorUtilityRuntime(),
		bunWrappers: auditBunRuntimeCatalog(),
		bunTest: auditBunTestCatalog(),
	};
}

/** Read monotonic nanoseconds at a point in time (Bun.nanoseconds). */
export function readMonotonicNanoseconds(): number {
	return nanoseconds();
}

/** Build a timing snapshot from elapsed nanoseconds. */
export function createDoctorTimingSnapshot(elapsedNs: number): DoctorTimingSnapshot {
	return {
		elapsedNs,
		elapsedMs: Math.round(elapsedNs / 1_000_000),
		monotonicNs: readMonotonicNanoseconds(),
	};
}

function padVisibleColumn(text: string, width: number): string {
	const visible = stringWidth(text);
	if (visible >= width) {
		return text;
	}
	return text + ' '.repeat(width - visible);
}

/**
 * Terminal table of doctor diagnostics with Bun.stringWidth column padding.
 */
export function formatDoctorDiagnosticsTable(
	diagnostics: DoctorDiagnostics = collectDoctorDiagnostics(),
): string {
	const rows = [
		{
			area: 'spawn',
			api: 'Bun.spawn',
			value: diagnostics.process.spawnAvailable ? 'yes' : 'no',
		},
		{
			area: 'spawn',
			api: 'Bun.spawnSync',
			value: diagnostics.process.spawnSyncAvailable ? 'yes' : 'no',
		},
		{
			area: 'timing',
			api: 'Bun.nanoseconds',
			value: diagnostics.utilities.nanosecondsAvailable ? 'yes' : 'no',
		},
		{
			area: 'terminal',
			api: 'Bun.stringWidth',
			value: diagnostics.utilities.stringWidthAvailable ? 'yes' : 'no',
		},
		{
			area: 'format',
			api: 'inspect.custom',
			value: diagnostics.utilities.inspectCustomAvailable ? 'yes' : 'no',
		},
		{
			area: 'signals',
			api: 'SIGINT/SIGTERM',
			value: diagnostics.signals.interruptSignals.join(', '),
		},
		{
			area: 'signals',
			api: 'Ctrl+C docs',
			value: BUN_CTRL_C_DOCS_URL.replace('https://', ''),
		},
		...diagnostics.bunWrappers.entries.map(entry => ({
			area: 'wrapper',
			api: entry.bunApi,
			value: entry.available
				? (entry.guideUrl ?? entry.docsUrl).replace('https://', '')
				: 'missing',
		})),
		...diagnostics.bunTest.groups.map(group => ({
			area: 'test',
			api: `bun:test ${group.label}`,
			value: diagnostics.bunTest.ok
				? `${group.apis.length} apis`
				: 'missing',
		})),
	];

	const colWidths = {
		area: Math.max(stringWidth('area'), ...rows.map(row => stringWidth(row.area))),
		api: Math.max(stringWidth('api'), ...rows.map(row => stringWidth(row.api))),
	};

	const paddedRows = rows.map(row => ({
		area: padVisibleColumn(row.area, colWidths.area),
		api: padVisibleColumn(row.api, colWidths.api),
		value: row.value,
	}));

	return formatTable(paddedRows, ['area', 'api', 'value'], {
		colors: shouldColorize(process.stderr),
	});
}

export type DoctorDiagnosticsInspectable = DoctorDiagnostics & Record<symbol, unknown>;

/** Doctor diagnostics object with Bun.inspect.custom table rendering. */
export function doctorDiagnosticsInspectable(
	diagnostics: DoctorDiagnostics = collectDoctorDiagnostics(),
): DoctorDiagnosticsInspectable {
	return withInspectCustom(diagnostics, depth => {
		if (depth < 0) {
			return '[DoctorDiagnostics]';
		}
		return formatDoctorDiagnosticsTable(diagnostics);
	}) as DoctorDiagnosticsInspectable;
}

/** Render diagnostics via inspect.custom (human doctor footer). */
export function formatDoctorDiagnosticsInspect(
	diagnostics: DoctorDiagnostics = collectDoctorDiagnostics(),
): string {
	return formatInspectCustom(doctorDiagnosticsInspectable(diagnostics));
}

export {BUN_OS_SIGNALS_DOCS_URL, BUN_CTRL_C_DOCS_URL};
