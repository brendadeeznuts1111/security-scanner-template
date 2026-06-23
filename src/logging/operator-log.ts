import path from 'path';
import {appendFile, mkdir} from 'fs/promises';
import type {DoctorIssue} from '../config/doctor.ts';
import {
	enrichDoctorIssue,
	operatorMasterLogPath,
	operatorMirrorLogPath,
	type EnrichedDoctorIssue,
} from './issue-catalog.ts';

export const OPERATOR_LOG_ENV = 'OPERATOR_LOG';
export const OPERATOR_LOG_PATH_ENV = 'OPERATOR_LOG_PATH';
export const OPERATOR_LOG_STDERR_ENV = 'OPERATOR_LOG_STDERR';

export interface OperatorLogEvent {
	type: 'issue';
	ts: string;
	scope: EnrichedDoctorIssue['scope'];
	/** Reverse-DNS domain id when scope is `domain`; pseudo ids (`install`, `*`) otherwise. */
	domain: string;
	coreSegment?: string;
	logSegment: string;
	code: string;
	location: string;
	field: string;
	path: string;
	severity: DoctorIssue['severity'];
	channel: string;
	message: string;
	mirror: string;
}

function isOperatorLogEnabled(): boolean {
	const value = process.env[OPERATOR_LOG_ENV];
	if (value === '0' || value === 'false') return false;
	// Enabled by default during doctor/operator runs; set OPERATOR_LOG=0 to disable.
	return true;
}

function masterLogPath(root: string): string {
	return process.env[OPERATOR_LOG_PATH_ENV] ?? operatorMasterLogPath(root);
}

async function ensureParent(filePath: string): Promise<void> {
	await mkdir(path.dirname(filePath), {recursive: true});
}

async function appendJsonl(filePath: string, payload: unknown): Promise<void> {
	await ensureParent(filePath);
	await appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

function toLogEvent(root: string, issue: EnrichedDoctorIssue): OperatorLogEvent {
	const mirror = operatorMirrorLogPath(root, issue);
	return {
		type: 'issue',
		ts: new Date().toISOString(),
		scope: issue.scope,
		domain: issue.domain,
		coreSegment: issue.coreSegment,
		logSegment: issue.logSegment,
		code: issue.code ?? 'UNSPECIFIED',
		location: issue.location,
		field: issue.field,
		path: issue.path,
		severity: issue.severity,
		channel: issue.channel,
		message: issue.message,
		mirror,
	};
}

/**
 * Append one enriched issue to the master operator log and its scope mirror.
 * Master log: `.security/operator.jsonl` (filter all panes here).
 * Mirror: `.security/<reverse-dns>/issues.jsonl` or `.security/<core|lib|install|…>/issues.jsonl`.
 */
export async function emitOperatorIssue(
	root: string,
	issue: DoctorIssue,
): Promise<EnrichedDoctorIssue> {
	const enriched = enrichDoctorIssue(issue);
	if (!isOperatorLogEnabled()) {
		return enriched;
	}

	const event = toLogEvent(root, enriched);
	const master = masterLogPath(root);
	const mirror = event.mirror;

	try {
		await Promise.all([appendJsonl(master, event), appendJsonl(mirror, event)]);
	} catch {
		/* never fail doctor/scans on log IO */
	}

	if (process.env[OPERATOR_LOG_STDERR_ENV] === '1') {
		console.error(
			`[operator] ${event.scope}/${event.logSegment} ${event.code} ${event.location}: ${event.message}`,
		);
	}

	return enriched;
}

export async function emitOperatorIssues(
	root: string,
	issues: readonly DoctorIssue[],
): Promise<EnrichedDoctorIssue[]> {
	const enriched: EnrichedDoctorIssue[] = [];
	for (const issue of issues) {
		enriched.push(await emitOperatorIssue(root, issue));
	}
	return enriched;
}

/**
 * Enrich every doctor issue (scope, location, channel, logSegment) and write to:
 * - `.security/operator.jsonl` (master — filter one pane)
 * - `.security/<reverse-dns>/issues.jsonl` or `.security/<core|lib|install|…>/issues.jsonl`
 */
export async function emitDoctorResultIssues(
	root: string,
	domains: {issues: DoctorIssue[]}[],
	crossDomainIssues: DoctorIssue[],
	peerMetaIssues: DoctorIssue[],
): Promise<{crossDomainIssues: EnrichedDoctorIssue[]; peerMetaIssues: EnrichedDoctorIssue[]}> {
	for (const entry of domains) {
		entry.issues = await emitOperatorIssues(root, entry.issues);
	}
	const cross = await emitOperatorIssues(root, crossDomainIssues);
	const peer = await emitOperatorIssues(root, peerMetaIssues);
	return {crossDomainIssues: cross, peerMetaIssues: peer};
}
