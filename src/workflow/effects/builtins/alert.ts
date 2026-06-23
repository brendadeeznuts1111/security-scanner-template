/**
 * Built-in alert effect — sends a webhook notification when issues or drift exist.
 */
import type {EffectPlugin, EffectContext} from '../plugin.ts';

export interface AlertEffectOptions {
	url?: string;
	fetchFn?: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

export class AlertEffect implements EffectPlugin {
	id = 'alert';
	name = 'Alert';
	description = 'Sends a webhook notification';

	condition(ctx: EffectContext): boolean {
		const hasIssues = ctx.results.some(result => result.issues.length > 0);
		const hasDrift =
			ctx.drift !== undefined && ctx.drift !== null && Object.keys(ctx.drift).length > 0;
		return hasIssues || hasDrift;
	}

	async run(ctx: EffectContext): Promise<void> {
		const options = ctx.options as AlertEffectOptions;
		const webhookUrl = options.url;
		if (typeof webhookUrl !== 'string' || !webhookUrl) {
			console.error(`[${ctx.domain}] Alert effect: missing url parameter`);
			return;
		}

		const payload = {
			domain: ctx.domain,
			timestamp: new Date().toISOString(),
			ok: ctx.report.ok,
			issueCount: ctx.report.issueCount,
			maxSeverity: ctx.report.maxSeverity,
			results: ctx.results.map(result => ({
				scanner: result.scannerId,
				status: result.status,
				issues: result.issues.length,
			})),
			drift: ctx.drift,
		};

		const fetchFn = options.fetchFn ?? fetch;
		try {
			const response = await fetchFn(webhookUrl, {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(payload),
			});
			if (response.ok) {
				if (ctx.result) {
					ctx.result.alertSent = true;
				}
				console.error(`[${ctx.domain}] Alert sent to ${webhookUrl}`);
			} else {
				const error = `HTTP ${response.status}`;
				if (ctx.result) {
					ctx.result.alertError = error;
				}
				console.error(`[${ctx.domain}] Alert failed: ${error}`);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (ctx.result) {
				ctx.result.alertError = message;
			}
			console.error(`[${ctx.domain}] Failed to send alert:`, message);
		}
	}
}
