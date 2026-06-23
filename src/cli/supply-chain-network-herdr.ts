import type {NetworkBaselineDelta} from '../intel/network-baseline.ts';
import type {NetworkHealthStatus} from '../intel/network-baseline.ts';

export const HERDR_DOCTOR_TAB_SCHEMA = 'herdr-doctor/supply-chain-network/v1';

export interface HerdrDoctorTabRow {
	field: string;
	value: string;
	channel?: string;
}

export interface HerdrDoctorTabDocument {
	schema: typeof HERDR_DOCTOR_TAB_SCHEMA;
	generatedAt: string;
	domain?: string;
	phase: string;
	rows: HerdrDoctorTabRow[];
}

export interface HerdrDoctorTabInput {
	domain?: string;
	phase: string;
	networkUnique: number;
	networkRaw: number;
	endpoints: number;
	healthRoutes: number;
	health: NetworkHealthStatus;
	probesOk: number;
	probesTotal: number;
	latencyMs: number;
	delta?: NetworkBaselineDelta;
	bundlePath: string;
}

export function buildHerdrDoctorTabDocument(input: HerdrDoctorTabInput): HerdrDoctorTabDocument {
	const rows: HerdrDoctorTabRow[] = [
		{field: 'phase', value: input.phase, channel: 'ops'},
		{field: 'bundle.path', value: input.bundlePath, channel: 'supplyChain'},
		{field: 'network.unique', value: String(input.networkUnique), channel: 'supplyChain'},
		{field: 'network.raw', value: String(input.networkRaw), channel: 'supplyChain'},
		{field: 'network.endpoints', value: String(input.endpoints), channel: 'supplyChain'},
		{field: 'network.health_routes', value: String(input.healthRoutes), channel: 'supplyChain'},
		{field: 'health.status', value: input.health, channel: 'ops'},
		{field: 'health.probes_ok', value: String(input.probesOk), channel: 'ops'},
		{field: 'health.probes_total', value: String(input.probesTotal), channel: 'ops'},
		{field: 'perf.latency_ms', value: String(input.latencyMs), channel: 'ops'},
	];
	if (input.delta) {
		rows.push(
			{
				field: 'delta.endpoints_added',
				value: String(input.delta.endpoints.added.length),
				channel: 'supplyChain',
			},
			{
				field: 'delta.endpoints_removed',
				value: String(input.delta.endpoints.removed.length),
				channel: 'supplyChain',
			},
			{
				field: 'delta.health_routes_added',
				value: String(input.delta.healthRoutes.added.length),
				channel: 'supplyChain',
			},
			{field: 'delta.health', value: input.delta.health, channel: 'ops'},
		);
	}
	if (input.domain) {
		rows.unshift({field: 'domain', value: input.domain, channel: 'supplyChain'});
	}
	return {
		schema: HERDR_DOCTOR_TAB_SCHEMA,
		generatedAt: new Date().toISOString(),
		domain: input.domain,
		phase: input.phase,
		rows,
	};
}

/** Plain-text doctor pane table (herdr-doctor tab layout). */
export function formatHerdrDoctorTabText(document: HerdrDoctorTabDocument): string {
	const header = `@${document.schema}`;
	const tableHeader = 'field          | value';
	const tableRows = document.rows.map(
		row => `${row.field.padEnd(15)}| ${row.value}`,
	);
	return [header, `generatedAt: ${document.generatedAt}`, tableHeader, ...tableRows].join('\n');
}