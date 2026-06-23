export interface StringWidthOptions {
	countAnsiEscapeCodes?: boolean;
	ambiguousIsNarrow?: boolean;
}

export interface WrapAnsiOptions {
	hard?: boolean;
	wordWrap?: boolean;
	trim?: boolean;
	ambiguousIsNarrow?: boolean;
}

/**
 * Measure the visible width of a string, accounting for CJK/wide characters.
 */
export function stringWidth(text: string, options?: StringWidthOptions): number {
	return Bun.stringWidth(text, options);
}

/**
 * Strip ANSI escape codes (`Bun.stripANSI` when available).
 */
export function stripAnsi(text: string): string {
	if (typeof Bun.stripANSI === 'function') {
		return Bun.stripANSI(text);
	}
	return text.replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * Wrap a string to a terminal column width, preserving ANSI styling.
 *
 * This is a lightweight implementation. For full ANSI-aware wrapping, use
 * Bun.wrapAnsi when available.
 */
export function wrapAnsi(text: string, columns: number, options?: WrapAnsiOptions): string {
	const hard = options?.hard ?? false;
	const wordWrap = options?.wordWrap ?? true;
	const trim = options?.trim ?? false;

	if (columns <= 0) return text;
	if (text.length === 0) return text;

	const lines: string[] = [];
	let currentLine = '';
	let currentWidth = 0;

	const words = wordWrap ? text.split(/\s+/) : [text];

	for (const word of words) {
		const wordWidth = stringWidth(word);

		if (currentWidth + wordWidth + (currentLine.length > 0 ? 1 : 0) > columns) {
			if (currentLine.length > 0) {
				lines.push(trim ? currentLine.trimEnd() : currentLine);
				currentLine = '';
				currentWidth = 0;
			}

			if (wordWidth > columns && hard) {
				let remaining = word;
				while (remaining.length > 0) {
					const chunk = remaining.slice(0, columns);
					lines.push(chunk);
					remaining = remaining.slice(columns);
				}
				continue;
			}
		}

		if (currentLine.length > 0) {
			currentLine += ' ';
			currentWidth += 1;
		}
		currentLine += word;
		currentWidth += wordWidth;
	}

	if (currentLine.length > 0) {
		lines.push(trim ? currentLine.trimEnd() : currentLine);
	}

	return lines.join('\n');
}

/**
 * Pad a string to a target visible width using spaces.
 */
export function padVisible(text: string, width: number): string {
	const visible = stringWidth(text);
	if (visible >= width) return text;
	return text + ' '.repeat(width - visible);
}

/**
 * Align text to the right within a target visible width.
 */
export function padVisibleRight(text: string, width: number): string {
	const visible = stringWidth(text);
	if (visible >= width) return text;
	return ' '.repeat(width - visible) + text;
}
