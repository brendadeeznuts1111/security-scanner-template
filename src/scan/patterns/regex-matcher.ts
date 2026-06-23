export interface RegexMatchPosition {
	line: number;
	column: number;
	snippet: string;
}

export function matchRegexPattern(content: string, pattern: string): RegexMatchPosition[] {
	const regex = new RegExp(pattern, 'g');
	const matches: RegexMatchPosition[] = [];
	let match: RegExpExecArray | null;

	while ((match = regex.exec(content)) !== null) {
		const before = content.slice(0, match.index);
		const lines = before.split('\n');
		const line = lines.length;
		const column = (lines[lines.length - 1] ?? '').length + 1;
		matches.push({
			line,
			column,
			snippet: match[0],
		});
	}

	return matches;
}
