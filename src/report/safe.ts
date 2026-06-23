import {escapeHtml as escapeHtmlText} from '../utils/escape-html.ts';
import type {ReportAdvisory, ReportOverride} from './types.ts';

/**
 * Escape dynamic text for safe HTML embedding.
 */
export function escapeHtml(text: string): string {
	return escapeHtmlText(text);
}

/**
 * Prevent script-tag breakout when embedding JSON in HTML.
 */
export function safeJsonScript(value: unknown): string {
	return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function renderAdvisoryRows(advisories: ReportAdvisory[]): string {
	return advisories
		.map(advisory => {
			const description = advisory.description
				? advisory.url
					? `<a href="${escapeHtml(advisory.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(advisory.description)}</a>`
					: escapeHtml(advisory.description)
				: '-';

			return `<tr>
				<td class="level ${escapeHtml(advisory.level)}">${escapeHtml(advisory.level)}</td>
				<td>${escapeHtml(advisory.package)}</td>
				<td>${escapeHtml(advisory.version ?? '-')}</td>
				<td>${escapeHtml((advisory.categories ?? []).join(', ') || '-')}</td>
				<td>${description}</td>
			</tr>`;
		})
		.join('\n');
}

export function renderOverrideRows(overrides: ReportOverride[]): string {
	return overrides
		.map(override => {
			const target = override.package ?? override.category ?? override.cve ?? '*';
			return `<tr>
				<td>${escapeHtml(override.action)}</td>
				<td>${escapeHtml(target)}</td>
				<td>${escapeHtml(override.reason)}</td>
			</tr>`;
		})
		.join('\n');
}
