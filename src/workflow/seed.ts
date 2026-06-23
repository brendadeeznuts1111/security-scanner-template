import path from 'path';
import {deepEquals} from '../utils/deep-equal.ts';
import {parseJson5File, writeJson5File} from '../utils/json5-config.ts';
import type {ScannerResult, WorkflowSeedDrift, WorkflowSeedScannerState} from './types.ts';

export const WORKFLOW_SEED_SCHEMA = 'workflow-seed';
export const WORKFLOW_SEED_VERSION = 1;

export interface WorkflowSeedDocument {
	schema: typeof WORKFLOW_SEED_SCHEMA;
	version: typeof WORKFLOW_SEED_VERSION;
	domain: string;
	createdAt: string;
	state: Record<string, WorkflowSeedScannerState>;
}

export function defaultWorkflowSeedPath(domain: string, projectRoot: string): string {
	return path.join(projectRoot, 'seeds', `${domain}.workflow-seed.json5`);
}

export function resolveWorkflowSeedPath(seedPath: string, projectRoot: string): string {
	return path.isAbsolute(seedPath) ? seedPath : path.resolve(projectRoot, seedPath);
}

export function scannerSeedState(result: ScannerResult): WorkflowSeedScannerState {
	const metrics = result.metrics ?? {};
	if (result.scannerId === 'patterns') {
		return {
			violations: metrics.matches ?? 0,
			roots: metrics.roots ?? 0,
		};
	}
	return {...metrics};
}

export function buildWorkflowSeedDocument(
	domain: string,
	results: readonly ScannerResult[],
): WorkflowSeedDocument {
	const state: Record<string, WorkflowSeedScannerState> = {};
	for (const result of results) {
		state[result.scannerId] = scannerSeedState(result);
	}
	return {
		schema: WORKFLOW_SEED_SCHEMA,
		version: WORKFLOW_SEED_VERSION,
		domain,
		createdAt: new Date().toISOString(),
		state,
	};
}

export function computeWorkflowSeedDrift(
	results: readonly ScannerResult[],
	seed: WorkflowSeedDocument,
): WorkflowSeedDrift {
	const drift: WorkflowSeedDrift = {};
	for (const result of results) {
		const expected = seed.state[result.scannerId];
		if (!expected) continue;
		const actual = scannerSeedState(result);
		if (!deepEquals(actual, expected)) {
			drift[result.scannerId] = {expected, actual};
		}
	}
	return drift;
}

export function hasWorkflowSeedDrift(drift: WorkflowSeedDrift | null | undefined): boolean {
	return drift !== null && drift !== undefined && Object.keys(drift).length > 0;
}

export async function loadWorkflowSeed(
	filePath: string,
	expectedDomain?: string,
): Promise<WorkflowSeedDocument | null> {
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		return null;
	}
	try {
		const parsed = await parseJson5File<WorkflowSeedDocument>(filePath);
		if (parsed.schema !== WORKFLOW_SEED_SCHEMA) {
			throw new Error(`invalid seed schema "${String(parsed.schema)}"`);
		}
		if (parsed.version !== WORKFLOW_SEED_VERSION) {
			throw new Error(`unsupported seed version ${String(parsed.version)}`);
		}
		if (!parsed.domain || typeof parsed.state !== 'object' || parsed.state === null) {
			throw new Error('seed missing domain or state');
		}
		if (expectedDomain && parsed.domain !== expectedDomain) {
			throw new Error(`seed domain "${parsed.domain}" does not match "${expectedDomain}"`);
		}
		return parsed;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`failed to load workflow seed ${filePath}: ${message}`);
	}
}

export async function writeWorkflowSeed(
	filePath: string,
	document: WorkflowSeedDocument,
): Promise<void> {
	await writeJson5File(filePath, document, {indent: 2});
}
