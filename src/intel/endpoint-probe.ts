import {scanWebSecurity} from '../scan/web-security.ts';
import type {
	EndpointMetaProbeResult,
	EndpointProbeReport,
	EndpointProbeTarget,
	EndpointProbeViolation,
} from './endpoint-types.ts';

const META_LEAK_PATTERNS: {pattern: RegExp; label: string}[] = [
	{pattern: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i, label: 'literal secret'},
	{pattern: /"(?:apiKey|accessToken|refreshToken|privateKey)"\s*:\s*"[^"]{8,}"/i, label: 'JSON credential field'},
	{pattern: /BEGIN (?:RSA |EC )?PRIVATE KEY/i, label: 'PEM private key'},
];

const DEFAULT_TIMEOUT_MS = 10_000;
const META_PREVIEW_MAX = 512;

function normalizeHeaders(headers: Headers): Record<string, string> {
	const out: Record<string, string> = {};
	headers.forEach((value, key) => {
		out[key.toLowerCase()] = value;
	});
	return out;
}

function scanMetaLeaks(preview: string, url: string, label?: string): EndpointProbeViolation[] {
	const violations: EndpointProbeViolation[] = [];
	for (const {pattern, label: leakLabel} of META_LEAK_PATTERNS) {
		if (!pattern.test(preview)) continue;
		violations.push({
			kind: 'meta-leak',
			severity: 'critical',
			message: `Response may expose sensitive data (${leakLabel})`,
			url,
			label,
		});
	}
	return violations;
}

function checkRequiredHeaders(
	headerMap: Record<string, string>,
	target: EndpointProbeTarget,
): EndpointProbeViolation[] {
	const violations: EndpointProbeViolation[] = [];
	for (const required of target.requireHeaders ?? []) {
		const key = required.toLowerCase();
		if (headerMap[key]) continue;
		violations.push({
			kind: 'header-missing',
			severity: 'high',
			message: `Missing required response header: ${required}`,
			url: target.url,
			label: target.label,
			header: required,
		});
	}
	return violations;
}

/** Probe one HTTP endpoint and collect security + meta metadata. */
export async function probeEndpointMeta(
	target: EndpointProbeTarget,
	options: {timeoutMs?: number} = {},
): Promise<EndpointMetaProbeResult> {
	const method = target.method ?? 'GET';
	const started = performance.now();
	const violations: EndpointProbeViolation[] = [];

	try {
		const response = await fetch(target.url, {
			method,
			headers: {accept: 'application/json, text/plain, */*'},
			signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
			redirect: 'follow',
		});

		const latencyMs = Math.round(performance.now() - started);
		const headerMap = normalizeHeaders(response.headers);
		const contentType = headerMap['content-type'];
		const server = headerMap.server;

		if (target.expectStatus !== undefined && response.status !== target.expectStatus) {
			violations.push({
				kind: 'status-mismatch',
				severity: 'high',
				message: `Expected HTTP ${target.expectStatus}, received ${response.status}`,
				url: target.url,
				label: target.label,
			});
		}

		violations.push(...checkRequiredHeaders(headerMap, target));

		let metaPreview: string | undefined;
		if (method === 'GET') {
			const text = await response.text();
			metaPreview = text.slice(0, META_PREVIEW_MAX);
			violations.push(...scanMetaLeaks(metaPreview, target.url, target.label));
		}

		const securityScan = await scanWebSecurity(metaPreview ?? '', headerMap, {rendered: false});
		for (const finding of securityScan.findings) {
			violations.push({
				kind: 'security-header',
				severity: finding.severity === 'fatal' ? 'high' : 'medium',
				message: finding.description,
				url: target.url,
				label: target.label,
				header: finding.value,
			});
		}

		return {
			url: target.url,
			label: target.label,
			method,
			ok: violations.length === 0,
			status: response.status,
			latencyMs,
			contentType,
			server,
			headers: headerMap,
			securityFindings: securityScan.findings,
			metaPreview,
			violations,
		};
	} catch (error) {
		const latencyMs = Math.round(performance.now() - started);
		const message = error instanceof Error ? error.message : String(error);
		violations.push({
			kind: 'unreachable',
			severity: 'high',
			message: `Endpoint probe failed: ${message}`,
			url: target.url,
			label: target.label,
		});
		return {
			url: target.url,
			label: target.label,
			method,
			ok: false,
			latencyMs,
			headers: {},
			securityFindings: [],
			violations,
		};
	}
}

/** Run meta probes for all configured endpoints. */
export async function scanEndpointMetaProbes(options: {
	root: string;
	domain?: string;
	targets: readonly EndpointProbeTarget[];
	timeoutMs?: number;
}): Promise<EndpointProbeReport> {
	const results: EndpointMetaProbeResult[] = [];
	for (const target of options.targets) {
		results.push(await probeEndpointMeta(target, {timeoutMs: options.timeoutMs}));
	}

	const violations = results.flatMap(result => result.violations);
	return {
		domain: options.domain,
		root: options.root,
		probed: results.length,
		results,
		violations,
	};
}

/** Aggregate probe report into health-style counters for network loop / doctor. */
export function summarizeEndpointProbeReport(report: EndpointProbeReport): {
	probesOk: number;
	probesTotal: number;
	latencyMs: number;
	status: 'healthy' | 'degraded' | 'unreachable';
} {
	const probesTotal = report.results.length;
	const probesOk = report.results.filter(result => result.ok).length;
	const latencyMs = Math.max(...report.results.map(result => result.latencyMs), 0);
	let status: 'healthy' | 'degraded' | 'unreachable' = 'unreachable';
	if (probesTotal === 0) {
		status = 'unreachable';
	} else if (probesOk === probesTotal) {
		status = 'healthy';
	} else if (probesOk > 0) {
		status = 'degraded';
	}
	return {probesOk, probesTotal, latencyMs, status};
}

export function formatEndpointProbeLine(result: EndpointMetaProbeResult): string {
	const label = result.label ? `${result.label} ` : '';
	const status = result.status ?? '—';
	const lines = [
		`${label}${result.url} — ${result.method} ${status} (${result.latencyMs}ms)`,
	];
	for (const violation of result.violations) {
		lines.push(`   → ${violation.severity} [${violation.kind}] ${violation.message}`);
	}
	if (result.metaPreview && result.metaPreview.length > 0) {
		const preview = result.metaPreview.replace(/\s+/g, ' ').trim();
		lines.push(`   → meta: ${preview.slice(0, 120)}${preview.length > 120 ? '…' : ''}`);
	}
	return lines.join('\n');
}