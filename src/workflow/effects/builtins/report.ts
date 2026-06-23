/**
 * Built-in report effect — writes a Markdown workflow report to disk.
 */
import {mkdirSync} from 'fs';
import path from 'path';
import {formatWorkflowMarkdown} from '../../output.ts';
import type {EffectContext, EffectPlugin} from '../plugin.ts';

export interface ReportEffectOptions {
	path?: boolean | string;
	format?: (ctx: EffectContext) => string;
}

function resolveReportPath(domain: string, report: boolean | string, projectRoot: string): string {
	if (typeof report === 'string') {
		const trimmed = report.trim();
		return path.isAbsolute(trimmed) ? trimmed : path.join(projectRoot, trimmed);
	}
	return path.join(projectRoot, 'reports', `${domain}-workflow.md`);
}

export class ReportEffect implements EffectPlugin {
	id = 'report';
	name = 'Report';
	description = 'Writes a Markdown workflow report';

	async run(ctx: EffectContext): Promise<void> {
		const options = ctx.options as ReportEffectOptions;
		const reportTarget = options.path;
		if (reportTarget === undefined || reportTarget === false) {
			return;
		}
		const reportPath = resolveReportPath(ctx.domain, reportTarget, ctx.projectRoot);
		const formatter = options.format ?? (() => formatWorkflowMarkdown(ctx.report));
		mkdirSync(path.dirname(reportPath), {recursive: true});
		await Bun.write(reportPath, formatter(ctx));
		if (ctx.result) {
			ctx.result.reportPath = reportPath;
		}
		console.error(`[workflow] ${ctx.domain} report written to ${reportPath}`);
	}
}
