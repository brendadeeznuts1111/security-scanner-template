/**
 * Parse TOML text using Bun.TOML.parse.
 */
export function parseToml<T = unknown>(text: string): T {
	return Bun.TOML.parse(text) as T;
}