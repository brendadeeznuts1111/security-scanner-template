export interface HtmlFinding {
	type: 'script' | 'inline-script' | 'suspicious-url';
	severity: 'fatal' | 'warn';
	description: string;
	value: string;
}

const SUSPICIOUS_SCRIPT_PATTERNS = [
	/\beval\s*\(/,
	/new\s+Function\s*\(/,
	/document\.cookie/,
	/process\.env/,
];

const SUSPICIOUS_URL_PATTERNS = [/javascript:/i, /data:text\/html/i];

/**
 * Scan an HTML response for suspicious scripts and URLs using HTMLRewriter.
 */
export async function scanHtmlResponse(html: string): Promise<HtmlFinding[]> {
	const findings: HtmlFinding[] = [];
	const inlineScripts: string[] = [];
	const scriptSources: string[] = [];
	const hrefs: string[] = [];

	const rewriter = new HTMLRewriter()
		.on('script', {
			element(element) {
				const src = element.getAttribute('src');
				if (src) {
					scriptSources.push(src);
				}
			},
			text(chunk) {
				const text = chunk.text.trim();
				if (text.length > 0) {
					inlineScripts.push(text);
				}
			},
		})
		.on('a', {
			element(element) {
				const href = element.getAttribute('href');
				if (href) hrefs.push(href);
			},
		});

	await rewriter.transform(new Response(html)).text();

	for (const source of scriptSources) {
		for (const pattern of SUSPICIOUS_URL_PATTERNS) {
			if (pattern.test(source)) {
				findings.push({
					type: 'script',
					severity: 'fatal',
					description: 'External script uses suspicious URL scheme',
					value: source,
				});
			}
		}
	}

	for (const script of inlineScripts) {
		for (const pattern of SUSPICIOUS_SCRIPT_PATTERNS) {
			if (pattern.test(script)) {
				findings.push({
					type: 'inline-script',
					severity: 'fatal',
					description: 'Inline script contains suspicious pattern',
					value: script.slice(0, 120),
				});
				break;
			}
		}
	}

	for (const href of hrefs) {
		for (const pattern of SUSPICIOUS_URL_PATTERNS) {
			if (pattern.test(href)) {
				findings.push({
					type: 'suspicious-url',
					severity: 'warn',
					description: 'Anchor href uses suspicious URL scheme',
					value: href,
				});
			}
		}
	}

	return findings;
}