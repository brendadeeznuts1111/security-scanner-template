import {cssVariables} from '../color/index.ts';
import {DEFAULT_COLORS} from '../config/defaults.ts';
import type {DomainColors} from '../config/types.ts';
import {filePathFromModuleUrl} from '../utils/runtime.ts';
import {DEFAULT_REPORT_MARKDOWN_OPTIONS, markdownToHtml} from '../markdown/index.ts';
import {generateMarkdownReport} from './markdown.ts';
import {renderAdvisoryRows, renderOverrideRows, safeJsonScript} from './safe.ts';
import {renderOperatorQr, renderVisualGallery, resolveReportVisuals} from './visuals.ts';
import type {ReportData} from './types.ts';

/** Strip token-bearing data URLs before embedding report JSON in HTML. */
function clientReportPayload(data: ReportData): ReportData {
	if (!data.operatorQr) {
		return data;
	}

	const {dataUrl: _dataUrl, ...operatorMeta} = data.operatorQr;
	return {
		...data,
		operatorQr: {
			...operatorMeta,
			dataUrl: '',
		},
	};
}

const TEMPLATE_PATH = filePathFromModuleUrl(new URL('./template.html', import.meta.url));

function buildThemeVars(colors: DomainColors = DEFAULT_COLORS): string {
	const mapped = {
		fatal: colors.fatal,
		warn: colors.warn,
		info: colors.info,
		ok: colors.success,
		primary: colors.primary,
		secondary: colors.secondary,
	};
	return cssVariables(mapped)
		.split('\n')
		.map(line => `\t\t\t\t${line}`)
		.join('\n');
}

/**
 * Generate a self-contained HTML security dashboard.
 */
export async function generateHtmlReport(
	data: ReportData,
	colors: DomainColors = DEFAULT_COLORS,
): Promise<string> {
	const template = (await Bun.file(TEMPLATE_PATH).text()).replace(
		'{{THEME_VARS}}',
		buildThemeVars(colors),
	);
	const markdown = generateMarkdownReport(data);
	const summaryMarkdown = markdown.split('## Advisories')[0] ?? markdown;
	const summaryHtml =
		markdownToHtml(summaryMarkdown, DEFAULT_REPORT_MARKDOWN_OPTIONS) ??
		`<pre>${summaryMarkdown.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`;
	const visuals = data.visuals?.length ? await resolveReportVisuals(data.visuals) : [];

	return template
		.replace('{{DATA}}', safeJsonScript(clientReportPayload(data)))
		.replace('{{SUMMARY_HTML}}', summaryHtml)
		.replace('{{OPERATOR_QR}}', renderOperatorQr(data.operatorQr))
		.replace('{{VISUAL_GALLERY}}', renderVisualGallery(visuals))
		.replace('{{ADVISORY_ROWS}}', renderAdvisoryRows(data.advisories))
		.replace('{{OVERRIDE_ROWS}}', renderOverrideRows(data.overrides));
}
