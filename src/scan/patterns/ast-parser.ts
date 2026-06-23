import type {ASTNode} from './ast-matcher.ts';

const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);

export function isAstScannablePath(filePath: string): boolean {
	const dot = filePath.lastIndexOf('.');
	if (dot < 0) return false;
	return SCAN_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
}

function detectLoader(source: string, filePath?: string): 'js' | 'ts' | 'tsx' {
	if (filePath?.endsWith('.tsx') || filePath?.endsWith('.jsx')) return 'tsx';
	if (filePath?.endsWith('.ts')) return 'ts';
	if (/^\s*</.test(source)) return 'tsx';
	if (/\binterface\b|\btype\b|:\s*\w+/.test(source)) return 'ts';
	return 'js';
}

function positionAt(source: string, index: number): {line: number; column: number} {
	const before = source.slice(0, index);
	const lines = before.split('\n');
	return {
		line: lines.length,
		column: (lines[lines.length - 1] ?? '').length + 1,
	};
}

function normalizeNativeAst(ast: unknown): ASTNode | null {
	if (!ast || typeof ast !== 'object') return null;
	const node = ast as ASTNode;
	if (typeof node.type !== 'string') return null;
	return node;
}

/**
 * Build an ESTree-compatible AST from source when Bun.Transpiler has no public walker.
 * Extracts CallExpression and MemberExpression nodes with source locations.
 */
export function buildAstFromSource(source: string): ASTNode {
	const nodes: ASTNode[] = [];

	const callRe = /\b([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?\s*\(/g;
	let match: RegExpExecArray | null;
	while ((match = callRe.exec(source)) !== null) {
		const objectName = match[1]!;
		const propertyName = match[2];
		const callee: ASTNode = propertyName
			? {
					type: 'MemberExpression',
					object: {type: 'Identifier', name: objectName},
					property: {type: 'Identifier', name: propertyName},
				}
			: {type: 'Identifier', name: objectName};

		nodes.push({
			type: 'CallExpression',
			callee,
			loc: {start: positionAt(source, match.index)},
		});
	}

	const memberRe = /\b([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\b/g;
	while ((match = memberRe.exec(source)) !== null) {
		nodes.push({
			type: 'MemberExpression',
			object: {type: 'Identifier', name: match[1]!},
			property: {type: 'Identifier', name: match[2]!},
			loc: {start: positionAt(source, match.index)},
		});
	}

	return {type: 'Program', body: nodes};
}

/**
 * Parse source into an AST using Bun.Transpiler when available, otherwise a source extractor.
 */
export function parseSourceAst(content: string, file: string): ASTNode | null {
	if (!isAstScannablePath(file)) {
		return null;
	}

	const loader = detectLoader(content, file);
	const transpiler = new Bun.Transpiler({loader});
	const nativeParse = (transpiler as {parse?: (source: string) => unknown}).parse;

	if (typeof nativeParse === 'function') {
		try {
			return (
				normalizeNativeAst(nativeParse.call(transpiler, content)) ?? buildAstFromSource(content)
			);
		} catch {
			return buildAstFromSource(content);
		}
	}

	try {
		return buildAstFromSource(content);
	} catch {
		return null;
	}
}
