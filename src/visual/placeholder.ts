import {loadImage} from './load.ts';
import type {ImageSource} from './types.ts';

/**
 * Generate thumbhash blur-up placeholders for lazy-loaded report visuals.
 */
export class PlaceholderGenerator {
	/**
	 * Generate a thumbhash data URL suitable for HTML `img src` placeholders.
	 */
	static async generate(source: ImageSource): Promise<string> {
		const image = await loadImage(source);
		return image.placeholder();
	}
}