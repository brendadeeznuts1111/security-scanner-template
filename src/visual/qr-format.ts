import path from 'path';

export type QrOutputFormat = 'terminal' | 'svg' | 'png' | 'webp';

const FORMAT_BY_EXT: Record<string, QrOutputFormat> = {
	'.svg': 'svg',
	'.png': 'png',
	'.webp': 'webp',
};

/**
 * Resolve QR output format from CLI flags and output path.
 *
 * Precedence: `--terminal` → `--format` → extension → `svg` (default for `--out`).
 */
export function resolveQrOutputFormat(options: {
	terminal?: boolean;
	format?: string;
	output?: string;
}): QrOutputFormat | undefined {
	if (options.terminal) {
		return 'terminal';
	}

	if (options.format) {
		const normalized = options.format.toLowerCase();
		if (normalized === 'svg' || normalized === 'png' || normalized === 'webp') {
			return normalized;
		}
		throw new Error(`unsupported --format: ${options.format} (use svg, png, or webp)`);
	}

	if (options.output) {
		const ext = path.extname(options.output).toLowerCase();
		return FORMAT_BY_EXT[ext] ?? 'svg';
	}

	return undefined;
}

export function qrFormatRequiresImage(format: QrOutputFormat): boolean {
	return format === 'png' || format === 'webp';
}