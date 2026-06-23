/**
 * Effect plugin interface for the workflow loop.
 *
 * Effects are post-scan actions that react to scanner results and seed drift.
 * Built-ins (log, alert, fix, report) ship with the registry; users can add
 * custom plugins via the `--effects-dir` CLI flag.
 */
import type {DomainRegistry} from '../../config/registry.ts';
import type {WorkflowSeedDocument} from '../seed.ts';
import type {
	ScannerResult,
	WorkflowEffectsResult,
	WorkflowRunReport,
	WorkflowSeedDrift,
} from '../types.ts';

export interface EffectContext {
	domain: string;
	projectRoot: string;
	results: ScannerResult[];
	report: WorkflowRunReport;
	drift?: WorkflowSeedDrift | null;
	seedState?: WorkflowSeedDocument | null;
	registry: DomainRegistry;
	options: Record<string, unknown>;
	result?: WorkflowEffectsResult;
}

export interface EffectPlugin {
	id: string;
	name: string;
	description: string;
	run(ctx: EffectContext): Promise<void>;
	condition?: (ctx: EffectContext) => boolean;
}

export interface EffectConfig {
	enabled: boolean;
	params?: Record<string, unknown>;
}
