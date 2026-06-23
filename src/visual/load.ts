import type {ImageSource} from './types.ts';

/**
 * Check whether Bun.Image is available in this runtime.
 */
export function isImageAvailable(): boolean {
	return typeof Bun !== 'undefined' && typeof Bun.Image === 'function';
}

/**
 * Require Bun.Image or throw a descriptive error.
 */
export function requireImage(): void {
	if (!isImageAvailable()) {
		throw new Error('Bun.Image is not available in this runtime');
	}
}

/**
 * Normalize any supported image source into a Bun.Image instance.
 */
export async function loadImage(source: ImageSource): Promise<Bun.Image> {
	requireImage();

	if (typeof source === 'string') {
		if (source.startsWith('data:')) {
			return new Bun.Image(source);
		}
		return new Bun.Image(Bun.file(source));
	}

	if (source instanceof Blob) {
		return new Bun.Image(await source.arrayBuffer());
	}

	return new Bun.Image(source);
}