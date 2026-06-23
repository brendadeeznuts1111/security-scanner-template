/**
 * Built-in log effect — emits drift and issue summaries to stderr.
 */
import type {EffectPlugin, EffectContext} from '../plugin.ts';

export class LogEffect implements EffectPlugin {
	id = 'log';
	name = 'Log';
	description = 'Logs drift and issues to stderr';

	condition(ctx: EffectContext): boolean {
		const hasDrift =
			ctx.drift !== undefined && ctx.drift !== null && Object.keys(ctx.drift).length > 0;
		const hasIssues = ctx.results.some(result => result.issues.length > 0);
		return hasDrift || hasIssues;
	}

	async run(ctx: EffectContext): Promise<void> {
		if (ctx.drift && Object.keys(ctx.drift).length > 0) {
			console.error(`[${ctx.domain}] Drift:`, JSON.stringify(ctx.drift, null, 2));
		}
		for (const result of ctx.results) {
			if (result.issues.length > 0) {
				console.error(`[${ctx.domain}] ${result.scannerId}: ${result.issues.length} issue(s)`);
				for (const issue of result.issues) {
					console.error(`[${ctx.domain}]  [${issue.severity}] ${issue.message}`);
				}
			}
		}
	}
}
