/**
 * Bun runtime metadata for workflow reports, alerts, and seed drift.
 *
 * @see https://github.com/oven-sh/bun/blob/main/docs/runtime/utils.mdx
 */
import {getRuntimeInfo} from '../utils/runtime.ts';
import type {WorkflowBunMetadata} from './types.ts';

export function collectWorkflowBunMetadata(): WorkflowBunMetadata {
	const runtime = getRuntimeInfo();
	return {
		version: runtime.version,
		revision: runtime.revision || undefined,
		platform: process.platform,
		isDebug: process.env.BUN_DEBUG === '1' || process.env.NODE_ENV === 'development',
	};
}
