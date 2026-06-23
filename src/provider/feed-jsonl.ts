import {
	AllowlistItemSchema,
	ThreatFeedItemSchema,
	type AllowlistItem,
	type ThreatFeedItem,
} from './validator.ts';

function parseLine(line: string): ThreatFeedItem | AllowlistItem | null {
	try {
		const parsed = JSON.parse(line) as unknown;
		if (parsed && typeof parsed === 'object') {
			if ('allowlist' in parsed || 'rules' in parsed) {
				return null;
			}
			if ('range' in parsed && 'categories' in parsed) {
				return ThreatFeedItemSchema.parse(parsed);
			}
			if ('reason' in parsed || ('package' in parsed && !('categories' in parsed))) {
				return AllowlistItemSchema.parse(parsed);
			}
		}
	} catch {
		// Ignore malformed lines.
	}
	return null;
}

/**
 * Parse a complete JSONL feed string into normalized rules and allowlist.
 * Each line is treated as an independent rule or allowlist item; malformed
 * lines are skipped so one bad line does not kill the whole feed.
 */
export function parseJSONLFeed(text: string): {
	rules: ThreatFeedItem[];
	allowlist: AllowlistItem[];
} {
	const rules: ThreatFeedItem[] = [];
	const allowlist: AllowlistItem[] = [];

	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;

		const item = parseLine(trimmed);
		if (!item) continue;

		if ('categories' in item) {
			rules.push(item);
		} else {
			allowlist.push(item);
		}
	}

	return {rules, allowlist};
}

/**
 * Stream a JSONL feed from a {@link Response} body.
 * Processes each complete line as it arrives, so threat intelligence can be
 * acted on before the entire feed is downloaded.
 */
export async function streamJSONLFeed(
	response: Response,
): Promise<{rules: ThreatFeedItem[]; allowlist: AllowlistItem[]}> {
	const stream = response.body;
	if (!stream) {
		throw new Error('Response body is not readable');
	}

	const rules: ThreatFeedItem[] = [];
	const allowlist: AllowlistItem[] = [];
	const decoder = new TextDecoder();
	let buffer = '';

	const reader = stream.getReader();
	try {
		while (true) {
			const {done, value: chunk} = await reader.read();
			if (done) break;
			buffer += decoder.decode(chunk, {stream: true});
			const result = Bun.JSONL.parseChunk(buffer);

			for (const value of result.values) {
				if (typeof value !== 'object' || value === null) continue;
				if ('allowlist' in value || 'rules' in value) continue;

				try {
					if ('categories' in value) {
						rules.push(ThreatFeedItemSchema.parse(value));
					} else if ('package' in value) {
						allowlist.push(AllowlistItemSchema.parse(value));
					}
				} catch {
					// Skip lines that fail schema validation.
				}
			}

			buffer = buffer.slice(result.read);
		}
	} finally {
		reader.releaseLock();
	}

	// Flush any trailing content.
	const final = Bun.JSONL.parseChunk(buffer);
	for (const value of final.values) {
		if (typeof value !== 'object' || value === null) continue;
		if ('allowlist' in value || 'rules' in value) continue;

		try {
			if ('categories' in value) {
				rules.push(ThreatFeedItemSchema.parse(value));
			} else if ('package' in value) {
				allowlist.push(AllowlistItemSchema.parse(value));
			}
		} catch {
			// Ignore trailing malformed lines.
		}
	}

	return {rules, allowlist};
}

/**
 * Detect whether a URL or file path represents a JSONL feed.
 */
export function isJSONLSource(urlOrPath: string): boolean {
	const lower = urlOrPath.toLowerCase();
	return lower.endsWith('.jsonl') || lower.endsWith('.ndjson');
}
