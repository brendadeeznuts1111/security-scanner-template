/**
 * Thin wrappers around [`Bun.color`](https://bun.com/docs/runtime/color).
 *
 * Source of truth: `oven-sh/bun` → `docs/runtime/color.mdx`
 * (formats table, `{rgba}` / `[rgba]` channel extraction, ANSI depths).
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

/** `{rgba}` — alpha is 0–1 (CSS-style). See Bun.color docs. */
export type RgbaObject = {r: number; g: number; b: number; a: number};

/** `{rgb}` — no alpha channel. */
export type RgbObject = {r: number; g: number; b: number};

/** `[rgba]` — alpha is 0–255 (typed-array friendly). */
export type RgbaArray = [number, number, number, number];

/** `[rgb]` — no alpha channel. */
export type RgbArray = [number, number, number];

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

/** Compact CSS string (`Bun.color(input, "css")`). */
export function toCss(input: ColorInput): string | null {
	return formatColor(input, 'css') as string | null;
}

/** Lowercase hex (`Bun.color(input, "hex")`). */
export function toHex(input: ColorInput): string | null {
	return formatColor(input, 'hex') as string | null;
}

/** `rgb(...)` string (`Bun.color(input, "rgb")`). */
export function toRgb(input: ColorInput): string | null {
	return formatColor(input, 'rgb') as string | null;
}

/** `rgba(...)` string (`Bun.color(input, "rgba")`). */
export function toRgba(input: ColorInput): string | null {
	return formatColor(input, 'rgba') as string | null;
}

/** `hsl(...)` string (`Bun.color(input, "hsl")`). */
export function toHsl(input: ColorInput): string | null {
	return formatColor(input, 'hsl') as string | null;
}

/**
 * Extract RGBA channels via `Bun.color(input, "{rgba}")`.
 * Alpha is 0–1 (CSS-style).
 */
export function toRgbaObject(input: ColorInput): RgbaObject | null {
	return formatColor(input, '{rgba}') as RgbaObject | null;
}

/**
 * Extract RGB channels via `Bun.color(input, "{rgb}")`.
 */
export function toRgbObject(input: ColorInput): RgbObject | null {
	return formatColor(input, '{rgb}') as RgbObject | null;
}

/**
 * Extract RGBA channels via `Bun.color(input, "[rgba]")`.
 * Alpha is 0–255 (all channels same integer range).
 */
export function toRgbaArray(input: ColorInput): RgbaArray | null {
	return formatColor(input, '[rgba]') as RgbaArray | null;
}

/**
 * Extract RGB channels via `Bun.color(input, "[rgb]")`.
 */
export function toRgbArray(input: ColorInput): RgbArray | null {
	return formatColor(input, '[rgb]') as RgbArray | null;
}

/**
 * Compact 24-bit color integer via `Bun.color(input, "number")`.
 */
export function toColorNumber(input: ColorInput): number | null {
	return formatColor(input, 'number') as number | null;
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
export function colorize(color: ColorInput, text: string, depth: AnsiColorDepth = 'ansi'): string {
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

/** Lighten a config color toward white for bright terminal / badge accents. */
export function brightenColor(input: ColorInput, mix = 0.22): string | null {
	const rgba = toRgbaObject(input);
	if (!rgba) return null;

	const blend = (channel: number) => Math.round(channel + (255 - channel) * mix);
	return normalizeHex({
		r: blend(rgba.r),
		g: blend(rgba.g),
		b: blend(rgba.b),
	});
}

export function cssVariables(colors: Record<string, string>, prefix = '--domain'): string {
	const lines: string[] = [];
	for (const [name, value] of Object.entries(colors)) {
		const css = toCss(value);
		if (css) {
			lines.push(`${prefix}-${name}: ${css};`);
		}
	}
	return lines.join('\n');
}
