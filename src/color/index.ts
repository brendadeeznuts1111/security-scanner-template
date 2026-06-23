/**
 * Bun.color wrappers for terminal output, config normalization, and CSS formatting.
 */

export type ColorInput =
	| string
	| number
	| {r: number; g: number; b: number; a?: number}
	| [number, number, number]
	| [number, number, number, number];

export type BunColorFormat =
	| 'css'
	| 'ansi'
	| 'ansi-16'
	| 'ansi-256'
	| 'ansi-16m'
	| 'number'
	| 'rgb'
	| 'rgba'
	| 'hsl'
	| 'hex'
	| 'HEX'
	| 'lab'
	| '{rgb}'
	| '{rgba}'
	| '[rgb]'
	| '[rgba]';

export type AnsiColorDepth = 'ansi' | 'ansi-16' | 'ansi-256' | 'ansi-16m';

/** Terminal palette aligned with domain template defaults. */
export const TERMINAL = {
	fatal: '#FF453A',
	warn: '#FF9500',
	success: '#30D158',
	info: '#0A84FF',
	muted: '#8E8E93',
	primary: '#0A84FF',
	secondary: '#30D158',
	supplyChain: '#BF5AF2',
	/** Legacy scanner stderr palette */
	scannerFatal: '#ff4444',
	scannerWarn: '#ffcc33',
	scannerOk: '#33dd66',
	scannerInfo: '#33aaff',
	scannerDim: '#888888',
} as const;

const ANSI_RESET = '\x1b[0m';

/**
 * Convert any supported CSS color input to the requested Bun.color format.
 * Returns null when the input cannot be parsed.
 */
export function formatColor<T extends BunColorFormat>(input: ColorInput, format: T): unknown {
	return Bun.color(input, format as any);
}

/**
 * Normalize a color to an uppercase 6-digit hex string (#RRGGBB).
 */
export function normalizeHex(input: ColorInput): string | null {
	return formatColor(input, 'HEX') as string | null;
}

/**
 * True when Bun.color can parse the input.
 */
export function isValidColor(input: unknown): input is ColorInput {
	if (input === null || input === undefined) return false;
	return Bun.color(input as ColorInput, 'hex') !== null;
}

/**
 * Normalize and validate a domain config color value.
 */
export function isValidConfigColor(input: unknown): boolean {
	const hex = normalizeHex(input as ColorInput);
	return hex !== null && /^#[0-9A-F]{6}$/.test(hex);
}

/**
 * Format a color as compact CSS (for inline styles and variables).
 */
export function toCss(input: ColorInput): string | null {
	return formatColor(input, 'css') as string | null;
}

/**
 * Extract RGBA channels as a Bun.color object.
 */
export function toRgbaObject(input: ColorInput): {r: number; g: number; b: number; a: number} | null {
	return formatColor(input, '{rgba}') as {r: number; g: number; b: number; a: number} | null;
}

/**
 * Get an ANSI escape code for the given color depth.
 */
export function ansiCode(input: ColorInput, depth: AnsiColorDepth = 'ansi'): string {
	return (formatColor(input, depth) as string | null) ?? '';
}

/**
 * Wrap text in an ANSI color when the terminal supports it.
 */
export function colorize(
	color: ColorInput,
	text: string,
	depth: AnsiColorDepth = 'ansi',
): string {
	const code = ansiCode(color, depth);
	return code ? `${code}${text}${ANSI_RESET}` : text;
}

/**
 * Map doctor / audit severity labels to terminal colors.
 */
export function severityColor(severity: string): string {
	switch (severity) {
		case 'error':
		case 'fatal':
			return TERMINAL.fatal;
		case 'warning':
		case 'warn':
			return TERMINAL.warn;
		default:
			return TERMINAL.info;
	}
}

/**
 * Emit CSS custom properties for a domain color map.
 */
export function cssVariables(
	colors: Record<string, string>,
	prefix = '--domain',
): string {
	const lines: string[] = [];
	for (const [name, value] of Object.entries(colors)) {
		const css = toCss(value);
		if (css) {
			lines.push(`${prefix}-${name}: ${css};`);
		}
	}
	return lines.join('\n');
}