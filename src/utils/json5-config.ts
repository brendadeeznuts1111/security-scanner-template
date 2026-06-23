/**
 * JSON5 config helpers aligned with Bun's JSON5 runtime API.
 *
 * @see https://bun.com/docs/runtime/json5
 */

export const BUN_JSON5_DOCS_URL = 'https://bun.com/docs/runtime/json5';

export function isJson5Available(): boolean {
	return (
		typeof (Bun as {JSON5?: {parse?: unknown; stringify?: unknown}}).JSON5?.parse === 'function' &&
		typeof (Bun as {JSON5?: {stringify?: unknown}}).JSON5?.stringify === 'function'
	);
}

export function parseJson5Text<T = unknown>(text: string): T {
	return Bun.JSON5.parse(text) as T;
}

export function stringifyJson5(
	value: unknown,
	space: string | number | null = 2,
	replacer?: (key: string, value: unknown) => unknown,
): string {
	const stringify = Bun.JSON5.stringify as (
		v: unknown,
		replacer?: null | ((key: string, value: unknown) => unknown),
		space?: string | number | null,
	) => string;
	return stringify(value, replacer ?? null, space ?? 2);
}

export async function parseJson5File<T = unknown>(filePath: string): Promise<T> {
	const text = await Bun.file(filePath).text();
	return parseJson5Text<T>(text);
}

export async function writeJson5File(
	filePath: string,
	value: unknown,
	options: {indent?: string | number; trailingNewline?: boolean} = {},
): Promise<void> {
	const indent = options.indent ?? 2;
	const body = stringifyJson5(value, indent);
	const trailingNewline = options.trailingNewline ?? true;
	await Bun.write(filePath, trailingNewline ? `${body}\n` : body);
}
