/**
 * HTML escaping aligned with Bun's escape-html guide.
 *
 * @see https://bun.com/docs/guides/util/escape-html
 * @see https://bun.com/docs/runtime/utils#bun-escapehtml
 */
export const BUN_ESCAPE_HTML_GUIDE_URL = 'https://bun.com/docs/guides/util/escape-html';
export const BUN_ESCAPE_HTML_DOCS_URL = 'https://bun.com/docs/runtime/utils#bun-escapehtml';

export type EscapeHtmlInput = string | number | boolean | object;

export function isEscapeHtmlAvailable(): boolean {
	return typeof Bun.escapeHTML === 'function';
}

/**
 * Escape HTML metacharacters (`Bun.escapeHTML`). Non-strings are coerced first.
 */
export function escapeHtml(value: EscapeHtmlInput): string {
	return Bun.escapeHTML(value);
}