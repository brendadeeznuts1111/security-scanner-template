/**
 * Wrappers around Bun's built-in Markdown API (unstable).
 *
 * @see https://bun.com/docs/runtime/markdown
 * Source: `oven-sh/bun` → `docs/runtime/markdown.mdx`
 */
export const BUN_MARKDOWN_DOCS_URL = 'https://bun.com/docs/runtime/markdown';

export type MarkdownAutolinkOptions =
	| boolean
	| {
			url?: boolean;
			www?: boolean;
			email?: boolean;
	  };

export type MarkdownHeadingOptions =
	| boolean
	| {
			ids?: boolean;
			autolink?: boolean;
	  };

/** Parser options for `Bun.markdown.html()` / `Bun.markdown.render()`. */
export interface MarkdownHtmlOptions {
	tables?: boolean;
	strikethrough?: boolean;
	tasklists?: boolean;
	autolinks?: MarkdownAutolinkOptions;
	headings?: MarkdownHeadingOptions;
	hardSoftBreaks?: boolean;
	wikiLinks?: boolean;
	underline?: boolean;
	latexMath?: boolean;
	collapseWhitespace?: boolean;
	permissiveAtxHeaders?: boolean;
	noIndentedCodeBlocks?: boolean;
	noHtmlBlocks?: boolean;
	noHtmlSpans?: boolean;
	tagFilter?: boolean;
}

/** GFM-oriented defaults for security report summaries (tables, task lists, safe HTML). */
export const DEFAULT_REPORT_MARKDOWN_OPTIONS: MarkdownHtmlOptions = {
	tables: true,
	strikethrough: true,
	tasklists: true,
	tagFilter: true,
	autolinks: true,
};

export type MarkdownRenderCallbacks = Record<
	string,
	((children: string, meta?: Record<string, unknown>) => string | null | undefined) | undefined
>;

function markdownApi(): typeof Bun.markdown | null {
	if (typeof Bun.markdown !== 'object' || Bun.markdown === null) {
		return null;
	}
	if (typeof Bun.markdown.html !== 'function') {
		return null;
	}
	return Bun.markdown;
}

/** True when `Bun.markdown.html` is available in the active runtime. */
export function isMarkdownAvailable(): boolean {
	return markdownApi() !== null;
}

/**
 * Render Markdown to an HTML string (`Bun.markdown.html`).
 * Returns null when the API is missing or input cannot be parsed.
 */
export function markdownToHtml(
	input: string,
	options: MarkdownHtmlOptions = DEFAULT_REPORT_MARKDOWN_OPTIONS,
): string | null {
	const api = markdownApi();
	if (!api) return null;
	return api.html(input, options as Record<string, unknown>) as string | null;
}

/**
 * Render Markdown with custom element callbacks (`Bun.markdown.render`).
 */
export function renderMarkdown(
	input: string,
	callbacks: MarkdownRenderCallbacks,
	options?: MarkdownHtmlOptions,
): string | null {
	const api = markdownApi();
	if (!api || typeof api.render !== 'function') return null;
	return api.render(
		input,
		callbacks as Record<string, unknown>,
		options as Record<string, unknown> | undefined,
	) as string | null;
}

/** Strip block/inline formatting — plain text suitable for logs and TTY summaries. */
export function markdownToPlaintext(input: string, options?: MarkdownHtmlOptions): string | null {
	return renderMarkdown(
		input,
		{
			heading: children => `${children}\n`,
			paragraph: children => `${children}\n`,
			blockquote: children => children,
			strong: children => children,
			emphasis: children => children,
			strikethrough: children => children,
			link: children => children,
			image: () => '',
			code: children => children,
			codespan: children => children,
			list: children => children,
			listItem: children => children,
			table: children => children,
			thead: children => children,
			tbody: children => children,
			tr: children => children,
			th: children => children,
			td: children => children,
			hr: () => '\n',
		},
		options,
	);
}

/** Minimal ANSI rendering for operator-facing terminal previews. */
export function markdownToAnsi(input: string, options?: MarkdownHtmlOptions): string | null {
	return renderMarkdown(
		input,
		{
			heading: (children, meta) => {
				const level = (meta?.level as number | undefined) ?? 1;
				const weight = level <= 2 ? '\x1b[1;4m' : '\x1b[1m';
				return `${weight}${children}\x1b[0m\n`;
			},
			paragraph: children => `${children}\n`,
			strong: children => `\x1b[1m${children}\x1b[22m`,
			emphasis: children => `\x1b[3m${children}\x1b[23m`,
			codespan: children => `\x1b[36m${children}\x1b[39m`,
			link: children => `\x1b[4m${children}\x1b[24m`,
			listItem: children => `• ${children.trimEnd()}\n`,
		},
		options,
	);
}