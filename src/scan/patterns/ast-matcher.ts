export interface ASTNode {
	type: string;
	loc?: {
		start: {line: number; column: number};
		end?: {line: number; column: number};
	};
	[key: string]: unknown;
}

type SelectorPredicate = (node: ASTNode) => boolean;

function unquote(value: string): string {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith("'") && trimmed.endsWith("'")) ||
		(trimmed.startsWith('"') && trimmed.endsWith('"'))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function readPath(node: ASTNode, path: string): unknown {
	const parts = path.split('.');
	let current: unknown = node;
	for (const part of parts) {
		if (current == null || typeof current !== 'object') {
			return undefined;
		}
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

export class ASTMatcher {
	/**
	 * Parse a selector string into a predicate function.
	 * Supports: `TypeName[prop=value][prop2=value2]`
	 */
	static parseSelector(selector: string): SelectorPredicate {
		const trimmed = selector.trim();
		const typeMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9]*)/);
		if (!typeMatch) {
			throw new Error(`Invalid AST selector: ${selector}`);
		}

		const typeName = typeMatch[1]!;
		const conditions: Array<{path: string; value: string}> = [];
		for (const match of trimmed.matchAll(/\[([^=]+)=([^\]]+)\]/g)) {
			conditions.push({
				path: match[1]!.trim(),
				value: unquote(match[2]!),
			});
		}

		return (node: ASTNode) => {
			if (node.type !== typeName) return false;
			for (const {path, value} of conditions) {
				const current = readPath(node, path);
				if (current == null) return false;
				if (String(current) !== value) return false;
			}
			return true;
		};
	}

	/** Walk an AST and collect nodes matching a selector. */
	static findNodes(ast: ASTNode, selector: string): ASTNode[] {
		const predicate = this.parseSelector(selector);
		const results: ASTNode[] = [];

		const walk = (node: ASTNode): void => {
			if (predicate(node)) {
				results.push(node);
			}
			for (const value of Object.values(node)) {
				if (Array.isArray(value)) {
					for (const item of value) {
						if (item && typeof item === 'object' && 'type' in item) {
							walk(item as ASTNode);
						}
					}
				} else if (value && typeof value === 'object' && 'type' in value) {
					walk(value as ASTNode);
				}
			}
		};

		walk(ast);
		return results;
	}
}
