/**
 * Bun.inspect helpers for doctor tables and debug output.
 *
 * @see https://bun.com/docs/runtime/utils#bun-inspect
 */
import {shouldColorize} from './process.ts';

export const BUN_INSPECT_DOCS_URL = 'https://bun.com/docs/runtime/utils#bun-inspect';

export function isInspectAvailable(): boolean {
	return typeof Bun.inspect === 'function';
}

export interface InspectTableOptions {
	colors?: boolean;
}

/**
 * Render tabular data for terminal output via Bun.inspect.table.
 */
export function formatTable(
	rows: Record<string, unknown>[],
	columns: string[],
	options: InspectTableOptions = {},
): string {
	return Bun.inspect.table(rows, columns, {
		colors: options.colors ?? shouldColorize(process.stderr),
	});
}

/**
 * Pretty-print an arbitrary value with Bun.inspect.
 */
export function formatValue(
	value: unknown,
	options: {depth?: number; colors?: boolean} = {},
): string {
	return Bun.inspect(value, {
		depth: options.depth,
		colors: options.colors ?? shouldColorize(process.stderr),
	});
}
