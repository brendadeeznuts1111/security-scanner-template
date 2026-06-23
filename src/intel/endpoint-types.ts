import type {WebSecurityFinding} from '../scan/web-security.ts';

export type EndpointProbeMethod = 'GET' | 'HEAD';

export interface EndpointProbeTarget {
	url: string;
	label?: string;
	method?: EndpointProbeMethod;
	expectStatus?: number;
	requireHeaders?: string[];
}

export type EndpointProbeViolationKind =
	| 'unreachable'
	| 'status-mismatch'
	| 'header-missing'
	| 'security-header'
	| 'meta-leak';

export interface EndpointProbeViolation {
	kind: EndpointProbeViolationKind;
	severity: 'critical' | 'high' | 'medium' | 'low';
	message: string;
	url: string;
	label?: string;
	header?: string;
}

export interface EndpointMetaProbeResult {
	url: string;
	label?: string;
	method: EndpointProbeMethod;
	ok: boolean;
	status?: number;
	latencyMs: number;
	contentType?: string;
	server?: string;
	headers: Record<string, string>;
	securityFindings: WebSecurityFinding[];
	/** Truncated response body preview (GET /meta, health JSON, etc.). */
	metaPreview?: string;
	violations: EndpointProbeViolation[];
}

export interface EndpointProbeReport {
	domain?: string;
	root: string;
	probed: number;
	results: EndpointMetaProbeResult[];
	violations: EndpointProbeViolation[];
}