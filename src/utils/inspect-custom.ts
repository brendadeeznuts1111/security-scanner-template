/**
 * Bun.inspect custom formatters via Symbol.for('nodejs.util.inspect.custom').
 * @see https://bun.com/docs/runtime/utils#bun-inspect-custom
 */

import {BUN_INSPECT_DOCS_URL} from './inspect.ts';
import {shouldColorize} from './process.ts';

export {BUN_INSPECT_DOCS_URL};

/** Node/Bun inspect custom symbol (same as `util.inspect.custom`). */
export const INSPECT_CUSTOM = Symbol.for('nodejs.util.inspect.custom');

export type InspectCustomFormatter = (depth: number, options: unknown) => string;

/**
 * Attach a custom Bun.inspect formatter to a plain object.
 */
export function withInspectCustom<T extends object>(
	value: T,
	formatter: InspectCustomFormatter,
): T {
	return Object.defineProperty({...value}, INSPECT_CUSTOM, {
		value: formatter,
		enumerable: false,
		configurable: true,
	}) as T;
}

/** Pretty-print a value, honoring `[inspect.custom]` when present. */
export function formatInspectCustom(
	value: unknown,
	options: {depth?: number; colors?: boolean} = {},
): string {
	return Bun.inspect(value, {
		depth: options.depth ?? 4,
		colors: options.colors ?? shouldColorize(process.stderr),
	});
}

/** True when Bun.inspect and the inspect.custom symbol are usable. */
export function isInspectCustomAvailable(): boolean {
	return typeof Bun.inspect === 'function' && typeof INSPECT_CUSTOM === 'symbol';
}
