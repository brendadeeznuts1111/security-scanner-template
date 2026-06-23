import type {ImageFormat} from './types.ts';

/**
 * Encode a Bun.Image into the requested output format.
 */
export function encodeImage(
	image: Bun.Image,
	format: ImageFormat,
	quality: number,
): Bun.Image {
	switch (format) {
		case 'jpeg':
			return image.jpeg({quality});
		case 'png':
			return image.png();
		case 'webp':
			return image.webp({quality});
	}
}